import type { AiClient } from "@brandloop/ai";
import { simulateReadableStream, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/**
 * Offline stand-ins for the chat model and the specialist client: unit tests script them step by step,
 * and `AI_MOCK_MODEL=1` (dev and e2e only; ignored in production) swaps them in for the real ones.
 */

/** One model step. `chunkDelayMs` overrides the model's pace for this step only. */
export type ScriptStep = {
  text?: string;
  toolCalls?: { toolCallId?: string; toolName: string; input: unknown }[];
  chunkDelayMs?: number;
};

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

function play(step: ScriptStep, modelDelayMs: number | undefined) {
  const chunkDelayMs = step.chunkDelayMs ?? modelDelayMs;
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

/** The first line of the `<open_document>` in the system prompt, or null when no post is open. */
function openDocumentFirstLine(prompt: Prompt): string | null {
  const system = prompt.find((m) => m.role === "system");
  const content = typeof system?.content === "string" ? system.content : "";
  const body = /<open_document[^>]*>\n([\s\S]*?)\n<\/open_document>/.exec(content)?.[1];
  return body?.split("\n").find((l) => l.trim())?.trim() ?? null;
}

const AFTER_TOOL: Record<string, string> = {
  saveMemory: "Saved that to your memory.",
  searchKB: "Here is what I found in your knowledge base.",
  createDocument: "Your draft is open on the right.",
  proposeDocumentEdits: "Here is a punchier opening. Apply it if you like it.",
  updateDocument: "Done. The shorter version is in the panel.",
  delegateEditing: "The review is ready.",
  suggestVisuals: "Here are three image ideas for your post.",
  proposeVisual: "Here is the image. Check the prompt, then make it.",
  editVisual: "On it. The new image will appear in the panel.",
};

/** A formatted reply for exercising the chat's markdown rendering offline. */
const MARKDOWN_REPLY = [
  "## Three ways to open the post",
  "",
  "Lead with the **moment**, not the lesson. A few options:",
  "",
  "- Start in the middle of the scene",
  "- Name the cost of getting it wrong",
  "- Ask the question your reader is already asking",
  "",
  "1. Pick one opening",
  "2. Cut the first sentence",
  "",
  "Read more in [the guide](https://example.com/guide) or [this one](javascript:alert(1)).",
].join("\n");

/**
 * The gap between words for a markdown reply asked for "slowly": slow enough that e2e can see it live and stop it mid-reply (the
 * default 5 ms pace finishes the markdown reply in well under a second, faster than a click lands).
 */
const SLOW_CHUNK_MS = 120;

/** Decides the next step from the conversation so far: a keyword router for offline end-to-end runs. */
function route(opts: CallOptions): ScriptStep {
  const has = new Set((opts.tools ?? []).map((t) => t.name));
  const text = textOf(opts.prompt[lastUserIndex(opts.prompt)]);
  const results = toolResultsThisTurn(opts.prompt);
  const call = (toolName: string, input: unknown): ScriptStep =>
    has.has(toolName) ? { toolCalls: [{ toolName, input }] } : { text: "Mock reply." };

  const last = results.at(-1);
  if (last) {
    if (last.toolName === "delegateWriting") {
      return call("createDocument", { title: SCRIPTED_TITLE, kind: "text", specialistHandoffToolCallId: last.toolCallId });
    }
    return { text: AFTER_TOOL[last.toolName] ?? "Done." };
  }
  if (/\bimages?\b/i.test(text) && /\bsuggest\b/i.test(text)) return call("suggestVisuals", { focusHint: null });
  if (/\b(image|picture)\b/i.test(text) && /\b(make|create|add)\b/i.test(text)) {
    return call("proposeVisual", { prompt: text.slice(0, 1_000), type: "general", aspect: null });
  }
  if (/\b(background|headline|colou?rs?)\b/i.test(text) && /\b(make|change|use)\b/i.test(text)) {
    return call("editVisual", { instruction: text.slice(0, 1_000) });
  }
  if (/\bremember\b/i.test(text)) {
    const fact = text.replace(/^.*?\bremember\b\s*(that\s+)?/i, "").replace(/[.!?\s]+$/, "") || text;
    return call("saveMemory", { category: "about", topic: null, facts: [fact] });
  }
  if (/\bknowledge\b/i.test(text)) return call("searchKB", { query: text.slice(0, 200), limit: 5 });
  const firstLine = openDocumentFirstLine(opts.prompt);
  if (firstLine && /\bpunchier\b/i.test(text)) {
    return call("proposeDocumentEdits", { instruction: text.slice(0, 1_000), targetText: firstLine });
  }
  if (firstLine && /\bshorter\b/i.test(text)) {
    return call("updateDocument", {
      description: text.slice(0, 2_000),
      editRequirements: ["Make the post shorter"],
      editScope: "whole-document",
      restoreVersion: null,
    });
  }
  if (firstLine && /\breview\b/i.test(text)) return call("delegateEditing", { request: text.slice(0, 4_000), specialty: "final-review" });
  if (/\bdraft\b/i.test(text)) {
    return call("delegateWriting", { request: `Write a short LinkedIn post for the user. Their request: ${text.slice(0, 2_000)}`, specialty: "post" });
  }
  if (/\bmarkdown\b/i.test(text)) return { text: MARKDOWN_REPLY, ...(/\bslowly\b/i.test(text) && { chunkDelayMs: SLOW_CHUNK_MS }) };
  return { text: "Mock reply." };
}

/** The keyword-scripted chat model behind `AI_MOCK_MODEL=1`. `chunkDelayMs` paces the stream (default 5 ms). */
export function createScriptedChatModel(opts: { chunkDelayMs?: number } = {}): LanguageModel {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "mock-chat",
    // Pretend every http(s) file URL is fetched by the provider, so mock runs never download attachments.
    supportedUrls: { "*/*": [/^https?:\/\//] },
    doStream: async (call) => play(route(call), opts.chunkDelayMs ?? 5),
  });
}

/** The post the mock writing specialist always returns. */
export const SCRIPTED_TITLE = "MVP versus POC";
export const SCRIPTED_DRAFT = [
  "Most founders build a proof of concept when they need a minimum viable product.",
  "A POC answers one question: can this work? An MVP answers a harder one: will anyone use it?",
  "Build the POC in a week. Ship the MVP to ten real users. Then decide.",
].join("\n\n");

/** Canned specialist outputs, tried in order against the requested schema. */
const CANNED: unknown[] = [
  { ok: true },
  {
    summary: "A short post on MVP versus POC.",
    findings: [],
    recommendation: "Create the post.",
    missingInput: [],
    confidence: "medium",
    parentAction: "create-document",
    payload: {
      readiness: "ready",
      title: SCRIPTED_TITLE,
      hook: "Most founders build a proof of concept when they need a minimum viable product.",
      draft: SCRIPTED_DRAFT,
      clarifyingQuestion: null,
    },
  },
];

/** The mock editor's replacement opening line and shortened post. */
export const SCRIPTED_HOOK = "Founders: stop building proofs of concept.";
export const SCRIPTED_SHORT = SCRIPTED_DRAFT.split("\n\n").slice(0, 2).join("\n\n");

CANNED.push(
  { replacement: SCRIPTED_HOOK },
  { text: SCRIPTED_SHORT, changeSummary: "Cut the closing paragraph", unmetRequirements: [] },
  {
    summary: "A clear, short post.",
    findings: [],
    recommendation: "Share the result with the user.",
    missingInput: [],
    confidence: "medium",
    parentAction: "respond",
    payload: { qualityReview: { passed: true, score: 84, issues: [], deterministicChecks: [] } },
  },
);

/** The mock image ideas (suggestVisuals). */
export const SCRIPTED_VISUAL_CONCEPTS = [
  { name: "Three habits list", description: "A clean numbered list of the three habits.", whyItWorks: "Lists are easy to scan in the feed.", type: "infographic", prompt: "A clean infographic with a numbered list of three habits, large readable type, calm colours." },
  { name: "Before and after", description: "Two columns showing the old way against the new way.", whyItWorks: "Contrast makes the change obvious at a glance.", type: "before_after", prompt: "A before-and-after comparison with two labelled columns, simple icons and a clear divider." },
  { name: "The key line", description: "The post's strongest sentence as a typographic card.", whyItWorks: "A single line is memorable and shareable.", type: "quote", prompt: "A typographic quote card with one strong sentence on a plain gradient background." },
];
CANNED.push({ concepts: SCRIPTED_VISUAL_CONCEPTS });

/** The mock carousel: slides for the scripted post (the carousel studio's "Generate slides"). */
export const SCRIPTED_SLIDES = [
  { title: "Most founders build the *wrong thing* first.", body: "" },
  { title: "A POC asks: *can this work?*", body: "One question, answered in a week." },
  { title: "An MVP asks: *will anyone use it?*", body: "A harder question, answered by real users." },
  { title: "Build the POC in a week.", body: "" },
  { title: "Ship the MVP to *ten real users.*", body: "Then decide." },
];
CANNED.push({ slides: SCRIPTED_SLIDES });

/** The mock "Ideas for this week" (apps/web/src/lib/ideas.ts): generic, clearly sample ideas; the route takes the first N. */
export const SCRIPTED_IDEAS = [
  { title: "MVP versus POC", angle: "Most teams build the wrong one first.", hook: "Most founders build a proof of concept when they need a minimum viable product.", format: "text", contentType: "educational", why: "Teaches a decision your audience faces this quarter." },
  { title: "The week I nearly quit", angle: "A hard week, and the one habit that got you through it.", hook: "Last Tuesday I wrote my resignation email to myself.", format: "text", contentType: "personal", why: "Personal posts build the trust your strategy relies on." },
  { title: "Three questions before any build", angle: "A short checklist people can save.", hook: "Before we write a line of code, we ask three questions.", format: "carousel", contentType: "authority", why: "A saveable framework shows expertise without bragging." },
  { title: "What I'd cut first", angle: "Opinion on scope: cut features, not quality.", hook: "If your roadmap has 40 items, 34 of them are wishes.", format: "text", contentType: "educational", why: "A clear opinion invites comments from your niche." },
  { title: "Ask me your stuck project", angle: "Offer a short review in exchange for a comment.", hook: "Comment \"review\" and I'll look at your stuck project this week.", format: "text", contentType: "lead_magnet", why: "Turns attention into conversations, which fits your goal." },
  { title: "Before and after", angle: "One project, two versions, what changed.", hook: "Same product. Two launch pages. One converted three times better.", format: "image", contentType: "sales", why: "Shows results through the work instead of claims." },
  { title: "Poll: build or buy", angle: "Let your audience pick a side, then share your take.", hook: "Build or buy your first internal tool?", format: "poll", contentType: "educational", why: "Polls lift reach and tell you what to write next." },
  { title: "My Monday planning ritual", angle: "The 20 minutes that shape the week.", hook: "Every Monday I plan the week on one index card.", format: "video", contentType: "personal", why: "A recurring ritual makes a natural weekly series." },
];

CANNED.push({ ideas: SCRIPTED_IDEAS });

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
