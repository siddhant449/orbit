import type { AiClient, Embedder } from "@brandloop/ai";
import {
  ChatError,
  claimRun,
  getChatDocument,
  getOrCreateChat,
  isStopRequested,
  lastAssistantContext,
  listMessages,
  releaseRun,
  saveAssistantMessage,
  saveUserMessage,
} from "@brandloop/db";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  InvalidToolInputError,
  NoSuchToolError,
  stepCountIs,
  streamText,
  ToolCallRepairError,
  toUIMessageStream,
  type LanguageModel,
  type Tool,
  type UIMessageStreamWriter,
} from "ai";
import { randomUUID } from "node:crypto";
import type { TurnContext } from "./context";
import { windowHistory } from "./history";
import { nextActiveTask, type TurnOutcome } from "./ledger";
import { LIMITS } from "./limits";
import { finalizeAbortedParts, toStoredParts } from "./persist";
import { buildSystemPrompt, loadPromptInput } from "./prompt";
import type { RunRegistry } from "./registry";
import { titleChat } from "./title";
import { isAbort } from "./tools/run";
import { buildTools, type ChatUIMessage } from "./tools";
import { ActiveTaskSchema, type ActiveTask, type ChatRequestBody, type MessageMetadata } from "./types";

export type ChatDeps = {
  model: LanguageModel;
  ai: AiClient;
  embedder: Embedder | null;
  registry: RunRegistry;
  /** Runs work after the response is sent (Next's `after`). */
  after: (fn: () => Promise<void>) => void;
  webSearchTool?: Tool | null;
  now?: () => Date;
  generateId?: () => string;
  /** Whole-turn deadline; past it the turn is aborted and its partial reply saved. Default 285 s (route max 300 s). */
  turnTimeoutMs?: number;
};

const TURN_TIMEOUT_MS = 285_000;
const DEFAULT_TITLE = "New chat";

export const STREAM_ERROR_TEXT = "Something went wrong while answering. Try again.";

/** Chat errors use Kleo's `{code, cause}` shape; `error` repeats the cause for our other routes' clients. */
export function chatError(code: string, cause: string, status: number, extra: object = {}): Response {
  return Response.json({ code, cause, error: cause, ...extra }, { status });
}

const CHAT_ERRORS = {
  chat_not_found: { status: 404, cause: "Chat not found." },
  chat_turn_active: { status: 409, cause: "This chat is still finishing its last reply." },
  message_id_conflict: { status: 400, cause: "That message id belongs to another message." },
} as const;

/** A retried POST that must not run again: the message already has a reply, or it isn't the newest. */
class TurnComplete extends Error {}

/** A tool body threw something unexpected. Carries only the tool name to the stream. */
class ToolStepError extends Error {
  constructor(readonly toolName: string, cause: unknown) {
    super(`tool ${toolName} threw`, { cause });
    this.name = "ToolStepError";
  }
}

const safeName = (name: string) => name.replace(/[^\w.-]/g, "").slice(0, 60) || "that tool";

/** A short, provider-free summary of why a tool input was rejected, from the zod issues in the cause chain. */
function issueSummary(err: unknown): string {
  let cur: unknown = err;
  for (let depth = 0; cur && depth < 6; depth++) {
    const issues = (cur as { issues?: unknown }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues
        .slice(0, 3)
        .map((i: { path?: unknown[]; message?: string }) => {
          const path = Array.isArray(i.path) && i.path.length > 0 ? i.path.join(".") : "input";
          return `${path}: ${String(i.message ?? "invalid").slice(0, 80)}`;
        })
        .join("; ")
        .slice(0, 240);
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return "the input didn't match the tool's schema";
}

/**
 * Text for a recoverable step error the model can act on, or null when the error is a top-level stream
 * failure. Never includes stacks, provider text or the thrown message.
 */
function toolErrorText(err: unknown): string | null {
  const e = ToolCallRepairError.isInstance(err) ? err.originalError : err;
  if (InvalidToolInputError.isInstance(e)) {
    return `Invalid input for ${safeName(e.toolName)}: ${issueSummary(e)}. Fix the input and call it again.`;
  }
  if (NoSuchToolError.isInstance(e)) {
    return `There is no tool named ${safeName(e.toolName)}. Use only the tools you were given.`;
  }
  if (e instanceof ToolStepError) return `Failed: the ${safeName(e.toolName)} step hit an unexpected error.`;
  return null;
}

/** Our tools report expected failures as strings; anything they throw is tagged so the stream can tell it from a model failure. */
function tagToolErrors<T extends Record<string, unknown>>(tools: T): T {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    const exec = (t as { execute?: (...a: unknown[]) => unknown }).execute;
    if (typeof exec !== "function") {
      out[name] = t;
      continue;
    }
    out[name] = {
      ...(t as object),
      execute: async (...args: unknown[]) => {
        try {
          return await exec.apply(t, args);
        } catch (err) {
          if (isAbort(err)) throw err;
          log(`tool ${name} threw`, err);
          throw new ToolStepError(name, err);
        }
      },
    };
  }
  return out as T;
}

/** Maps a db `ChatError` to its response. `activeTurn` may be missing on a contended 409. */
export function chatErrorResponse(err: ChatError): Response {
  const { status, cause } = CHAT_ERRORS[err.code];
  return chatError(err.code, cause, status, err.code === "chat_turn_active" ? { activeTurn: err.activeTurn ?? null } : {});
}

function log(what: string, err: unknown) {
  if (isAbort(err)) return; // a stop is not an error
  console.error(`[agent] ${what}: ${err instanceof Error ? err.message : String(err)}`);
}

type Part = ChatUIMessage["parts"][number];
const FAILED_OUTPUT = /^(Failed:|Refused:|EXISTING_POST:)/;

/** A tool result that didn't do its job: a `Failed:`/`Refused:` string, an `{error}` object or a question back. */
function failedOutput(output: unknown): boolean {
  if (typeof output === "string") return FAILED_OUTPUT.test(output);
  if (!output || typeof output !== "object") return false;
  const o = output as { error?: unknown; status?: unknown };
  return typeof o.error === "string" || o.status === "needs-user-input";
}

/** The ledger's summary of each specialist handoff made this turn. */
function handoffSummaries(handoffs: TurnContext["handoffs"]): TurnOutcome["handoffs"] {
  return [...handoffs.values()].map((h) => {
    const payload = h.payload as { readiness?: unknown } | null;
    return {
      id: h.handoffId,
      specialist: h.specialist,
      readiness: typeof payload?.readiness === "string" ? payload.readiness : null,
      confidence: h.confidence,
      parentAction: h.parentAction,
      requestDigest: h.requestDigest,
      hasMissingInput: h.missingInput.length > 0,
    };
  });
}

function toolResults(parts: Part[]): TurnOutcome["toolResults"] {
  const out: TurnOutcome["toolResults"] = [];
  for (const p of parts) {
    if (!p.type.startsWith("tool-")) continue;
    const t = p as { state?: string; output?: unknown };
    if (t.state !== "output-available" && t.state !== "output-error") continue;
    const ok = t.state === "output-available" && !failedOutput(t.output);
    out.push({ toolName: p.type.slice("tool-".length), ok });
  }
  return out;
}

const textOf = (parts: Part[]) =>
  parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();

/**
 * One chat turn (design §3, §12): lock the chat, store the user's message, window the history, build the
 * prompt and tools, then stream `streamText` as a UI message stream. `onEnd` always runs, even on stop or
 * a dropped client, because the registry reads its SSE copy to the end; it saves the assistant message
 * with the next task ledger and releases the lock in a `finally`.
 */
export async function runChatTurn(
  deps: ChatDeps,
  caller: { userId: string; profileId: string },
  body: ChatRequestBody,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const newId = deps.generateId ?? (() => randomUUID());
  const { profileId, userId } = caller;
  const { id: chatId, runId } = body;
  const requestMessageId = body.message.id;

  const totalText = body.message.parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
  if (totalText > LIMITS.messageChars) {
    return chatError(
      "message_too_long",
      `That message is too long. Keep it under ${LIMITS.messageChars.toLocaleString("en-US")} characters.`,
      413,
    );
  }

  let defaultTitle: boolean;
  try {
    const { chat } = await getOrCreateChat(profileId, userId, chatId);
    defaultTitle = chat.title === DEFAULT_TITLE;
    // The lock's clock is the server's, not the injectable turn clock.
    await claimRun(chatId, runId, requestMessageId);
  } catch (err) {
    if (err instanceof ChatError) return chatErrorResponse(err);
    throw err;
  }

  let setup;
  try {
    setup = await prepareTurn();
  } catch (err) {
    deps.registry.finish(chatId, runId);
    await releaseRun(chatId, runId).catch((e) => log("release after failed setup", e));
    if (err instanceof ChatError) return chatErrorResponse(err);
    if (err instanceof TurnComplete) return chatError("chat_turn_complete", err.message, 409, { activeTurn: null });
    log("chat turn setup failed", err);
    return chatError("internal_error", STREAM_ERROR_TEXT, 500);
  }
  const { ctx, tools, instructions, window, modelMessages, prevTask, controller, userText } = setup;

  const assistantId = newId();
  const createdAt = now().toISOString();
  const modelId = typeof deps.model === "string" ? deps.model : deps.model.modelId;
  const metadata: MessageMetadata = { createdAt, modelId };
  let streamFailed = false;

  /** Top-level failures (model, network, processing) fail the turn; tool step errors are recoverable. */
  const streamErrorText = (err: unknown) => {
    streamFailed = true;
    log("chat stream error", err);
    return STREAM_ERROR_TEXT;
  };
  // The SDK reports an invalid tool call twice: once with the error object (tool-input-error), then with
  // its string form (tool-output-error). Remember the text made for the object so the string maps to it.
  const toolErrorByMessage = new Map<string, string>();
  const uiErrorText = (err: unknown) => {
    if (typeof err === "string") {
      const known = toolErrorByMessage.get(err);
      if (known) return known;
      if (/^AI_(InvalidToolInputError|NoSuchToolError|ToolCallRepairError)\b/.test(err)) {
        return "That tool call was invalid. Check the tool name and input, then try again.";
      }
      return streamErrorText(err);
    }
    const text = toolErrorText(err);
    if (text === null) return streamErrorText(err);
    if (err instanceof Error) {
      toolErrorByMessage.set(String(err), text);
      toolErrorByMessage.set(err.message, text);
    }
    return text;
  };

  const stream = createUIMessageStream<ChatUIMessage>({
    originalMessages: window,
    generateId: () => assistantId,
    execute: ({ writer }) => {
      ctx.writer = writer as unknown as UIMessageStreamWriter;
      const result = streamText({
        model: deps.model,
        instructions,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(LIMITS.steps),
        maxOutputTokens: LIMITS.maxOutputTokens,
        abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(deps.turnTimeoutMs ?? TURN_TIMEOUT_MS)]),
        // Another instance may have asked this run to stop (POST /api/chat/stop landed elsewhere).
        prepareStep: async () => {
          if (await isStopRequested(chatId, runId).catch(() => false)) controller.abort();
          return {};
        },
        onError: ({ error }) => {
          streamFailed = true;
          log("chat model error", error);
        },
      });
      // Keep the model stream flowing to the end no matter who reads the UI stream.
      void Promise.resolve(result.consumeStream({ onError: () => {} })).catch(() => {});
      writer.merge(
        toUIMessageStream<typeof tools, ChatUIMessage>({
          stream: result.stream,
          tools,
          originalMessages: window,
          generateMessageId: () => assistantId,
          sendReasoning: false,
          sendSources: true,
          messageMetadata: ({ part }) => (part.type === "start" || part.type === "finish" ? metadata : undefined),
          onError: uiErrorText,
        }),
      );
    },
    onError: streamErrorText,
    onEnd: async ({ responseMessage, isAborted, outcome, finishReason }) => {
      try {
        const failed = streamFailed || outcome.status === "failed" || finishReason === "error";
        const finish = isAborted ? "aborted" : failed ? "error" : "stop";
        let parts = toStoredParts(responseMessage.parts);
        if (finish !== "stop") parts = finalizeAbortedParts(parts);

        const turn: TurnOutcome = {
          requestMessageId,
          requestText: userText,
          assistantText: textOf(parts),
          status: finish === "stop" ? "finished" : finish === "aborted" ? "aborted" : "error",
          toolResults: toolResults(parts),
          handoffs: handoffSummaries(ctx.handoffs),
          artifact: ctx.documentRef.current
            ? { id: ctx.documentRef.current.id, title: ctx.documentRef.current.title }
            : null,
          flow: null,
          picker: null,
          now: now(),
        };
        const activeTask = nextActiveTask(prevTask, turn, () => ctx.taskId);

        await saveAssistantMessage(chatId, {
          id: assistantId,
          runId,
          parts,
          metadata: { ...(responseMessage.metadata ?? {}), ...metadata },
          context: {
            requestMessageId,
            runId,
            activeTask,
            documentId: ctx.documentRef.current?.id ?? null,
            modelId,
            finish,
          },
        });
        if (defaultTitle && userText) deps.after(async () => void (await titleChat(deps.ai, chatId, userText)));
      } catch (err) {
        log("saving the assistant message failed", err);
      } finally {
        await releaseRun(chatId, runId).catch((e) => log("releasing the run failed", e));
        deps.registry.finish(chatId, runId);
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: ({ stream: sse }) => deps.registry.attach(chatId, runId, sse),
  });

  /** Everything between taking the lock and streaming. Any throw here releases the lock. */
  async function prepareTurn() {
    await saveUserMessage(chatId, {
      id: requestMessageId,
      parts: body.message.parts,
      metadata: body.message.metadata ?? { createdAt: now().toISOString() },
      context: {
        runId,
        selectedKnowledgeBaseIds: body.selectedKnowledgeBaseIds,
        selectedWritingStyleId: body.selectedWritingStyleId,
        webSearchEnabled: body.webSearchEnabled,
        documentContext: body.documentContext ?? null,
        quickLinkKey: body.quickLinkKey ?? null,
        flowType: body.flowType ?? null,
        flowStep: body.flowStep ?? null,
        uiAction: body.uiAction ?? null,
      },
    });

    const stored = await listMessages(profileId, chatId);
    const own = stored.find((m) => m.id === requestMessageId && m.role === "user");
    const answered = stored.some(
      (m) =>
        m.role === "assistant" &&
        (m.context as { requestMessageId?: unknown } | null)?.requestMessageId === requestMessageId,
    );
    // A retried POST (same message id) after the reply was saved: never answer twice. The client adopts
    // the stored reply through GET /api/chat/:id/messages.
    if (answered) throw new TurnComplete("This message already has a reply.");
    // The stored copy wins over a retry's body, so the model, the ledger and the title all see one text.
    const userText = textOf((own?.parts ?? body.message.parts) as Part[]);
    const history = stored.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts,
      ...(m.metadata ? { metadata: m.metadata } : {}),
    })) as ChatUIMessage[];
    const window = windowHistory(history);
    const newest = window.at(-1);
    if (newest?.role !== "user" || newest.id !== requestMessageId) {
      throw new TurnComplete("This message isn't the newest in the chat. Reload the conversation.");
    }

    const parsed = ActiveTaskSchema.safeParse((await lastAssistantContext(chatId))?.activeTask);
    const prevTask: ActiveTask | null = parsed.success ? parsed.data : null;

    const ctx: TurnContext = {
      profileId,
      userId,
      chatId,
      runId,
      requestMessageId,
      // Continue the active task's id, so tools and the ledger agree on it.
      taskId: prevTask?.status === "active" ? prevTask.taskId : newId(),
      ai: deps.ai,
      embedder: deps.embedder,
      selections: {
        knowledgeIds: body.selectedKnowledgeBaseIds,
        writingStyleId: body.selectedWritingStyleId,
        webSearchEnabled: body.webSearchEnabled,
        quickLinkKey: body.quickLinkKey ?? null,
      },
      writer: null,
      handoffs: new Map(),
      documentRef: { current: await getChatDocument(profileId, chatId) },
      documentContext: body.documentContext ?? null,
      now,
    };
    const tools = tagToolErrors(buildTools(ctx, { webSearchTool: deps.webSearchTool }));
    const instructions = buildSystemPrompt(await loadPromptInput(ctx, prevTask));
    const modelMessages = await convertToModelMessages(window, { tools, ignoreIncompleteToolCalls: true });
    const controller = deps.registry.start(chatId, runId);
    return { ctx, tools, instructions, window, modelMessages, prevTask, controller, userText };
  }
}
