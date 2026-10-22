import type { AiClient } from "@brandloop/ai";
import { renderBlocks, type WriterBlock } from "./writing/render";
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

function openDocumentText(prompt: Prompt): string | null {
  const system = prompt.find((m) => m.role === "system");
  const content = typeof system?.content === "string" ? system.content : "";
  return /<open_document[^>]*>\n([\s\S]*?)\n<\/open_document>/.exec(content)?.[1] ?? null;
}

const AFTER_TOOL: Record<string, string> = {
  saveMemory: "Saved that to your memory.",
  searchKB: "Here is what I found in your knowledge base.",
  createDocument: "Your draft is open on the right.",
  proposeDocumentEdits: "Here is a punchier opening. Apply it if you like it.",
  updateDocument: "Done. The shorter version is in the panel.",
  delegateEditing: "The review is ready.",
  analyzePost: "Here is the analysis. Fix the first item before anything else.",
  generateHooks: "Here are five hook options, each a different kind. Pick the one you like.",
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
    if (last.toolName === "delegateWriting" && /\[e2e:needs-facts\]/.test(text)) {
      return { text: `Before I write this I need two facts only you have. ${SCRIPTED_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join(" ")}` };
    }
    if (last.toolName === "delegateWriting") {
      return call("createDocument", { title: SCRIPTED_TITLE, kind: "text", specialistHandoffToolCallId: last.toolCallId });
    }
    return { text: AFTER_TOOL[last.toolName] ?? "Done." };
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
  if (/\banalyze\b/i.test(text) && has.has("analyzePost")) {
    const pasted = text.includes("\n") ? text.slice(text.indexOf("\n") + 1).trim() : "";
    return call("analyzePost", { postContent: pasted.length >= 20 ? pasted : null });
  }
  const picked = /Use this opening line: "([^"]+)"/.exec(text)?.[1];
  if (picked) {
    return call("delegateWriting", {
      request: `Write a short LinkedIn post for the user that opens with the line they picked. Their request: ${text.slice(0, 1_000)}`,
      specialty: "post",
      personalDetails: null,
      overrides: null,
      chosenHook: { text: picked, spine: null },
    });
  }
  if (/\bhook (variations?|options?)\b|\bopening lines\b/i.test(text)) {
    return call("generateHooks", { topic: "Hiring your first engineer as a founder", draftBody: firstLine ? openDocumentText(opts.prompt) : null, count: 5, excludeHooks: [] });
  }
  if (/\bdraft\b/i.test(text)) {
    return call("delegateWriting", {
      request: `Write a short LinkedIn post for the user. Their request: ${text.slice(0, 2_000)}`,
      specialty: "post",
      personalDetails: /\b(without|skip|no) personal (details|anecdotes)\b/i.test(text) ? "none" : null,
      overrides: null,
      chosenHook: null,
    });
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
export const SCRIPTED_BLOCKS: WriterBlock[] = [
  { kind: "hook", lines: ["Most founders build a proof of concept when they need a minimum viable product."] },
  { kind: "bullets", lines: ["A POC and an MVP answer different questions:", "A POC asks: can this work?", "An MVP asks: will anyone use it?"] },
  { kind: "close", lines: ["Build the POC in a week. Ship the MVP to ten real users. Then decide."] },
];
export const SCRIPTED_DRAFT = renderBlocks(SCRIPTED_BLOCKS, { bullet: "-", numbered: true });

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
      postType: "framework",
      blocks: SCRIPTED_BLOCKS,
      facts: [],
      missingFacts: [],
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

/** The mock own-style extraction (Task W4): the descriptive parts of a style; the layout is measured by the server. */
const MOCK_RULES = (t: string) => ({ do: [`Keep ${t} short and plain.`], dont: [`Pad the ${t}.`] });
export const SCRIPTED_STYLE = {
  language: "en-GB",
  voiceTarget: "Write plainly, in short blocks, with one concrete detail per post.",
  rules: { hooks: MOCK_RULES("hooks"), rhythm: MOCK_RULES("rhythm"), formatting: MOCK_RULES("formatting"), diction: MOCK_RULES("word choice"), closings: MOCK_RULES("closings"), global: MOCK_RULES("posts") },
  signatureMoves: [{ label: "Plain open", pattern: "[A flat claim about the work].", useWhen: "opening any post" }],
  finalChecks: ["Is the hook one short line?", "Is there one concrete detail?"],
  referencePostIndexes: [0, 1, 2],
  postTypes: ["story", "opinion", "short"],
};
CANNED.push(SCRIPTED_STYLE);

/** The mock post analysis (Task W10): six good ratings and one cosmetic note, which belongs under "Optional". */
export const SCRIPTED_ANALYSIS = {
  criteria: ["hook", "fold-layout", "flow", "voice-rules", "accuracy", "audience-clarity"].map((id) => ({ id, rating: "good", note: `The ${id} reads well.` })),
  issues: [{ quote: "", problem: "The closing line could be a little warmer.", rewrite: "", impact: "nit" }],
  optional: [],
};
CANNED.push(SCRIPTED_ANALYSIS);

/** One scripted hook per purpose, plain and short, about hiring a first engineer (Task W7). */
const MOCK_HOOK_TEXTS: Record<string, string> = {
  claim: "Hiring your first engineer is a product decision.",
  contrarian: "Stop searching for a rockstar engineer.",
  mistake: "The costliest first-hire mistake: hiring for speed.",
  "how-to": "How to brief an engineer before day one.",
  comparison: "Generalist or specialist? Pick by stage.",
  curiosity: "What good engineers ask before they say yes.",
  story: "Last spring, my first hire quit in week two.",
  proof: "Our first hire shipped on day four.",
  number: "Three questions to ask before any first hire.",
  prediction: "Soon, small teams will hire for judgement first.",
  question: "What if the job post is the real filter?",
  announcement: "New: a hiring checklist for founders.",
};

/** The scripted answer to a hooks call: one hook for each purpose named in the prompt's <assignments>. */
function mockHooks(prompt: string): { hooks: unknown[] } | null {
  const block = /<assignments>\n([\s\S]*?)\n<\/assignments>/.exec(prompt)?.[1];
  if (!block) return null;
  const purposes = [...block.matchAll(/^\d+\. ([a-z-]+) \(/gm)].map((m) => m[1]!);
  return {
    hooks: purposes.map((purpose) => ({
      purpose,
      text: MOCK_HOOK_TEXTS[purpose] ?? "A plain first line.",
      claim: `The post makes the ${purpose} point.`,
      mustDeliver: "One concrete example that backs the line.",
      bodyShape: "A short lead-in and two to three items",
      isPersonal: purpose === "story" || purpose === "proof",
    })),
  };
}

/** Keyword routes, tried before CANNED: one schema can return a different canned output per scenario. */
export const SCRIPTED_QUESTIONS = ["Who was your first hire, and when did you hire them?", "What changed for the team after they joined?"];
const WALL =
  "A proof of concept answers one narrow question about whether the idea can work at all, while a minimum viable product answers a much wider one about real demand, about paying users, about retention and about what the team should build next";
export const EMOJI_DRAFT_BLOCKS: WriterBlock[] = [
  { kind: "hook", lines: ["Stop building the wrong thing \u{1F680}"] },
  { kind: "prose", lines: [WALL] },
  { kind: "close", lines: ["Pick the harder question first."] },
];
export const EMOJI_REPAIRED_BLOCKS: WriterBlock[] = [
  { kind: "hook", lines: ["Stop building the wrong thing \u{1F680}"] },
  { kind: "prose", lines: ["A proof of concept answers one narrow question.", "A minimum viable product answers a wider one."] },
  { kind: "prose", lines: ["The wider one is about real demand and paying users."] },
  { kind: "close", lines: ["Pick the harder question first."] },
];
const ROUTES: { match: RegExp; output: unknown }[] = [
  {
    // A format picked in the composer (Task W8): the scripted writer follows a plan with a numbered list.
    match: /The user picked this format \("Myth, truth, proof"\)/,
    output: {
      summary: "A myth-truth-proof post.",
      findings: [],
      recommendation: "Create the post.",
      missingInput: [],
      confidence: "medium",
      parentAction: "create-document",
      payload: {
        readiness: "ready",
        title: "MVP myths",
        postType: "framework",
        blocks: [
          { kind: "hook", lines: ["An MVP is not a small version of the product."] },
          { kind: "numbered", lines: ["Three things an MVP actually is:", "A test of one risky assumption", "A way to hear from real users", "A reason to stop building early"] },
          { kind: "close", lines: ["Build the smallest thing that can prove you wrong."] },
        ],
        facts: [],
        missingFacts: [],
        clarifyingQuestion: null,
      },
    },
  },
  {
    match: /\[e2e:emoji-draft\]/,
    output: {
      summary: "A short post.",
      findings: [],
      recommendation: "Create the post.",
      missingInput: [],
      confidence: "medium",
      parentAction: "create-document",
      payload: { readiness: "ready", title: "Wrong thing first", postType: "opinion", blocks: EMOJI_DRAFT_BLOCKS, facts: [], missingFacts: [], clarifyingQuestion: null },
    },
  },
  // The polish pass's repair call (writing/polish.ts) carries the same request, so it matches the marker too.
  { match: /\[e2e:emoji-draft\]/, output: { blocks: EMOJI_REPAIRED_BLOCKS } },
  {
    match: /\[e2e:needs-facts\]/,
    output: {
      summary: "The post needs facts only the author has.",
      findings: [],
      recommendation: "Ask the user for the missing facts.",
      missingInput: SCRIPTED_QUESTIONS,
      confidence: "low",
      parentAction: "ask-user",
      payload: {
        readiness: "needs-user-input",
        title: "Your first hire",
        postType: "story",
        blocks: [],
        facts: [],
        missingFacts: SCRIPTED_QUESTIONS,
        clarifyingQuestion: SCRIPTED_QUESTIONS[0],
      },
    },
  },
];

/** A specialist client for mock mode: `text` names chats, `json` returns the first canned output the schema accepts. */
export function scriptedAi(): AiClient {
  return {
    async text() {
      return "Mock chat";
    },
    async json({ schema, prompt }) {
      const hooks = mockHooks(prompt);
      if (hooks) {
        const parsed = schema.safeParse(hooks);
        if (parsed.success) return parsed.data;
      }
      for (const route of ROUTES) {
        if (!route.match.test(prompt)) continue;
        const parsed = schema.safeParse(route.output);
        if (parsed.success) return parsed.data;
      }
      for (const candidate of CANNED) {
        const parsed = schema.safeParse(candidate);
        if (!parsed.success) continue;
        // A picked hook becomes the opening of the scripted post (the real writer is told the same in its brief).
        const chosen = /chosenHook: open the post with exactly this hook: "([^"]+)"/.exec(prompt)?.[1];
        const payload = (parsed.data as { payload?: { blocks?: WriterBlock[] } } | null)?.payload;
        if (chosen && payload?.blocks?.length) {
          return { ...parsed.data, payload: { ...payload, blocks: [{ kind: "hook", lines: [chosen] }, ...payload.blocks.slice(1)] } } as typeof parsed.data;
        }
        return parsed.data;
      }
      throw new Error("scriptedAi has no canned output for this schema.");
    },
  };
}
