import type { AiClient } from "@brandloop/ai";
import { simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/**
 * Offline stand-ins for the chat model and the specialist client: unit tests script them step by step,
 * and `AI_MOCK_MODEL=1` (dev and e2e only; ignored in production) swaps them in for the real ones.
 */

export type ScriptStep = { text?: string; toolCalls?: { toolCallId?: string; toolName: string; input: unknown }[] };

type CallOptions = Parameters<MockLanguageModelV4["doStream"]>[0];
type StreamPart = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer P> ? P : never;

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let callSeq = 0;

/** The stream parts for one step: text as word deltas, then tool calls, then finish. */
function stepParts(step: ScriptStep): StreamPart[] {
  const parts: StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (step.text) {
    parts.push({ type: "text-start", id: "t0" });
    for (const word of step.text.match(/\s*\S+/g) ?? []) parts.push({ type: "text-delta", id: "t0", delta: word });
    parts.push({ type: "text-end", id: "t0" });
  }
  for (const call of step.toolCalls ?? []) {
    parts.push({
      type: "tool-call",
      toolCallId: call.toolCallId ?? `call_mock_${++callSeq}`,
      toolName: call.toolName,
      input: JSON.stringify(call.input),
    });
  }
  const unified = step.toolCalls?.length ? "tool-calls" : "stop";
  parts.push({ type: "finish", usage: USAGE, finishReason: { unified, raw: unified } });
  return parts;
}

function play(step: ScriptStep, chunkDelayMs: number | undefined) {
  return {
    stream: simulateReadableStream({
      chunks: stepParts(step),
      initialDelayInMs: chunkDelayMs ?? null,
      chunkDelayInMs: chunkDelayMs ?? null,
    }),
  };
}

/** A model that plays `steps` in order, one per `doStream` call; the last step repeats. */
export function scriptedModel(steps: ScriptStep[], opts: { chunkDelayMs?: number } = {}): MockLanguageModelV4 {
  if (steps.length === 0) throw new Error("scriptedModel needs at least one step");
  let i = 0;
  return new MockLanguageModelV4({
    doStream: async () => play(steps[Math.min(i++, steps.length - 1)]!, opts.chunkDelayMs),
  });
}

type Prompt = CallOptions["prompt"];

function lastUserIndex(prompt: Prompt): number {
  for (let i = prompt.length - 1; i >= 0; i--) if (prompt[i]!.role === "user") return i;
  return -1;
}

function textOf(message: Prompt[number] | undefined): string {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

/** Tool results that arrived after the newest user message, i.e. during this turn. */
function toolResultsThisTurn(prompt: Prompt): { toolName: string; toolCallId: string }[] {
  const out: { toolName: string; toolCallId: string }[] = [];
  for (const m of prompt.slice(lastUserIndex(prompt) + 1)) {
    if (m.role !== "tool" && m.role !== "assistant") continue;
    for (const p of m.content) if (p.type === "tool-result") out.push({ toolName: p.toolName, toolCallId: p.toolCallId });
  }
  return out;
}

const AFTER_TOOL: Record<string, string> = {
  saveMemory: "Saved that to your memory.",
  searchKB: "Here is what I found in your knowledge base.",
  createDocument: "Your draft is open on the right.",
};

/** Decides the next step from the conversation so far: a keyword router for offline end-to-end runs. */
function route(opts: CallOptions): ScriptStep {
  const has = new Set((opts.tools ?? []).map((t) => t.name));
  const text = textOf(opts.prompt[lastUserIndex(opts.prompt)]);
  const results = toolResultsThisTurn(opts.prompt);
  const call = (toolName: string, input: unknown): ScriptStep =>
    has.has(toolName) ? { toolCalls: [{ toolName, input }] } : { text: "Mock reply." };

  const last = results.at(-1);
  if (last) {
    if (last.toolName === "delegateWriting") return call("createDocument", { handoffId: last.toolCallId });
    return { text: AFTER_TOOL[last.toolName] ?? "Done." };
  }
  if (/\bremember\b/i.test(text)) {
    const fact = text.replace(/^.*?\bremember\b\s*(that\s+)?/i, "").replace(/[.!?\s]+$/, "") || text;
    return call("saveMemory", { category: "about", topic: null, facts: [fact] });
  }
  if (/\bknowledge\b/i.test(text)) return call("searchKB", { query: text.slice(0, 200), limit: 5 });
  if (/\bdraft\b/i.test(text)) return call("delegateWriting", { request: text.slice(0, 2_000) });
  return { text: "Mock reply." };
}

/** The keyword-scripted chat model behind `AI_MOCK_MODEL=1`. */
export function createScriptedChatModel(): LanguageModel {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "mock-chat",
    // Pretend every http(s) file URL is fetched by the provider, so mock runs never download attachments.
    supportedUrls: { "*/*": [/^https?:\/\//] },
    doStream: async (opts) => play(route(opts), 5),
  });
}

/** Canned specialist outputs, tried in order against the requested schema. Task 8 adds the writer's. */
const CANNED: unknown[] = [{ ok: true }];

/** A specialist client for mock mode: `text` names chats, `json` returns the first canned output the schema accepts. */
export function scriptedAi(): AiClient {
  return {
    async text() {
      return "Mock chat";
    },
    async json({ schema }) {
      for (const candidate of CANNED) {
        const parsed = schema.safeParse(candidate);
        if (parsed.success) return parsed.data;
      }
      throw new Error("scriptedAi has no canned output for this schema.");
    },
  };
}
