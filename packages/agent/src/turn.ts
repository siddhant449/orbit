import type { AiClient, Embedder } from "@brandloop/ai";
import {
  ChatError,
  claimRun,
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
  stepCountIs,
  streamText,
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
};

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

/** Maps a db `ChatError` to its response. `activeTurn` may be missing on a contended 409. */
export function chatErrorResponse(err: ChatError): Response {
  const { status, cause } = CHAT_ERRORS[err.code];
  return chatError(err.code, cause, status, err.code === "chat_turn_active" ? { activeTurn: err.activeTurn ?? null } : {});
}

const log = (what: string, err: unknown) =>
  console.error(`[agent] ${what}: ${err instanceof Error ? err.message : String(err)}`);

type Part = ChatUIMessage["parts"][number];
const FAILED_OUTPUT = /^(Failed:|Refused:)/;

function toolResults(parts: Part[]): TurnOutcome["toolResults"] {
  const out: TurnOutcome["toolResults"] = [];
  for (const p of parts) {
    if (!p.type.startsWith("tool-")) continue;
    const t = p as { state?: string; output?: unknown };
    if (t.state !== "output-available" && t.state !== "output-error") continue;
    const ok = t.state === "output-available" && !(typeof t.output === "string" && FAILED_OUTPUT.test(t.output));
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

  const userText = textOf(body.message.parts as Part[]);
  const totalText = body.message.parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
  if (totalText > LIMITS.messageChars) {
    return chatError(
      "message_too_long",
      `That message is too long. Keep it under ${LIMITS.messageChars.toLocaleString("en-US")} characters.`,
      413,
    );
  }

  let created: boolean;
  try {
    ({ created } = await getOrCreateChat(profileId, userId, chatId));
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
    log("chat turn setup failed", err);
    return chatError("internal_error", STREAM_ERROR_TEXT, 500);
  }
  const { ctx, tools, instructions, window, modelMessages, prevTask, controller } = setup;

  const assistantId = newId();
  const createdAt = now().toISOString();
  const modelId = typeof deps.model === "string" ? deps.model : deps.model.modelId;
  const metadata: MessageMetadata = { createdAt, modelId };
  let streamFailed = false;

  const streamErrorText = (err: unknown) => {
    streamFailed = true;
    log("chat stream error", err);
    return STREAM_ERROR_TEXT;
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
        abortSignal: controller.signal,
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
          onError: streamErrorText,
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
          handoffs: [],
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
        if (created && userText) deps.after(async () => void (await titleChat(deps.ai, chatId, userText)));
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
    const history = stored.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts,
      ...(m.metadata ? { metadata: m.metadata } : {}),
    })) as ChatUIMessage[];
    const window = windowHistory(history);

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
      // The open document arrives with the documents task.
      documentRef: { current: null },
      now,
    };
    const tools = buildTools(ctx, { webSearchTool: deps.webSearchTool });
    const instructions = buildSystemPrompt(await loadPromptInput(ctx, prevTask));
    const modelMessages = await convertToModelMessages(window, { tools, ignoreIncompleteToolCalls: true });
    const controller = deps.registry.start(chatId, runId);
    return { ctx, tools, instructions, window, modelMessages, prevTask, controller };
  }
}
