import { LIMITS } from "./limits";
import type { ChatUIMessage } from "./tools";

export const OMITTED_OUTPUT = "[output omitted; call the tool again if you need it]";

type WindowOpts = { maxMessages: number; maxChars: number; fullToolOutputs: number; maxToolOutputChars: number };
type Part = ChatUIMessage["parts"][number];

const DEFAULTS: WindowOpts = {
  maxMessages: LIMITS.historyMessages,
  maxChars: LIMITS.historyChars,
  fullToolOutputs: LIMITS.historyFullToolOutputs,
  maxToolOutputChars: LIMITS.historyToolOutputChars,
};

const isReasoning = (p: Part) => p.type === "reasoning" || p.type === "reasoning-file";
const isToolWithOutput = (p: Part): p is Part & { output: unknown } =>
  (p.type.startsWith("tool-") || p.type === "dynamic-tool") && "output" in p && p.output !== undefined;

function truncateOutput(output: unknown, max: number): unknown {
  const text = typeof output === "string" ? output : JSON.stringify(output);
  if (text === undefined || text.length <= max) return output;
  return `${text.slice(0, max)}\n[truncated: ${(text.length - max).toLocaleString("en-US")} more characters]`;
}

const size = (m: ChatUIMessage) => JSON.stringify(m.parts).length;

/** Drop leading messages until the window starts at a user message. */
function fromFirstUser(messages: ChatUIMessage[]): ChatUIMessage[] {
  const i = messages.findIndex((m) => m.role === "user");
  return i === -1 ? [] : messages.slice(i);
}

/**
 * The history window sent to the orchestrator (design §7.2). Pure: returns new messages and never
 * mutates its input. Reasoning is dropped; old tool outputs are replaced by a note (inputs stay);
 * large outputs are truncated; then the oldest messages go until the window fits the char budget.
 * The window always starts at a user message.
 */
export function windowHistory(messages: ChatUIMessage[], opts: Partial<WindowOpts> = {}): ChatUIMessage[] {
  const o = { ...DEFAULTS, ...opts };
  let window = fromFirstUser(messages.slice(-o.maxMessages));

  window = window.map((m, i) => {
    const old = i < window.length - o.fullToolOutputs;
    const parts = m.parts.filter((p) => !isReasoning(p)).map((p) => {
      if (!isToolWithOutput(p)) return p;
      return { ...p, output: old ? OMITTED_OUTPUT : truncateOutput(p.output, o.maxToolOutputChars) } as Part;
    });
    return { ...m, parts };
  });

  // Drop the oldest messages to fit, but never past the newest user message.
  const lastUser = window.findLastIndex((m) => m.role === "user");
  let first = 0;
  let total = window.reduce((s, m) => s + size(m), 0);
  while (total > o.maxChars && first < lastUser) {
    total -= size(window[first]!);
    first++;
  }
  return fromFirstUser(window.slice(first));
}
