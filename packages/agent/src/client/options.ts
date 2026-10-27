/** Client-safe helpers for the options panel (presentOptions). Nothing here imports server code. */
export type OptionsPanel = {
  pickerToolCallId: string;
  preamble: string | null;
  question: string;
  options: { id: string; label: string; explainer: string; badge?: string }[];
  recommendedOptionId: string | null;
  allowFreeInput: boolean;
  freeInputPlaceholder: string;
};

type PartLike = { type: string; state?: string; toolCallId?: string; output?: unknown };
type MessageLike = { role: string; parts: unknown[]; metadata?: unknown };

/** The panel of a finished presentOptions call, or null for anything else (a partial or malformed output). */
export function parseOptionsPanel(part: PartLike): OptionsPanel | null {
  if ((part.type !== "tool-presentOptions" && part.type !== "tool-generateIdeas") || part.state !== "output-available" || typeof part.toolCallId !== "string") return null;
  const o = part.output as Partial<OptionsPanel> & { shown?: unknown } | null;
  if (!o || o.shown !== true || typeof o.question !== "string" || !Array.isArray(o.options)) return null;
  const options = o.options.flatMap((x) => {
    const r = x as { id?: unknown; label?: unknown; explainer?: unknown; badge?: unknown };
    return typeof r.id === "string" && typeof r.label === "string" && typeof r.explainer === "string"
      ? [{ id: r.id, label: r.label, explainer: r.explainer, ...(typeof r.badge === "string" && r.badge ? { badge: r.badge } : {}) }]
      : [];
  });
  if (options.length < 2) return null;
  return {
    pickerToolCallId: part.toolCallId,
    preamble: typeof o.preamble === "string" && o.preamble ? o.preamble : null,
    question: o.question,
    options,
    recommendedOptionId: typeof o.recommendedOptionId === "string" ? o.recommendedOptionId : null,
    allowFreeInput: o.allowFreeInput !== false,
    freeInputPlaceholder: typeof o.freeInputPlaceholder === "string" && o.freeInputPlaceholder ? o.freeInputPlaceholder : "Or tell me something else…",
  };
}

const textOf = (m: MessageLike) => m.parts.map((p) => ((p as { type?: string; text?: string }).type === "text" ? (p as { text?: string }).text ?? "" : "")).join("").trim();

/**
 * The panels in `messages[index]` and, for each, the user's answer: the label of the picked option, or their own
 * words when they typed instead. Null while nobody has replied after the message.
 */
export function panelsOf(messages: MessageLike[], index: number): { panel: OptionsPanel; answer: string | null }[] {
  type Row = { panel: OptionsPanel; answer: string | null };
  const message = messages[index];
  if (!message || message.role !== "assistant") return [];
  const reply = messages.slice(index + 1).find((m) => m.role === "user");
  const pick = (reply?.metadata as { optionPick?: { pickerToolCallId?: string; optionId?: string } } | undefined)?.optionPick;
  return (message.parts as PartLike[]).flatMap((p): Row[] => {
    const panel = parseOptionsPanel(p);
    if (!panel) return [];
    if (!reply) return [{ panel, answer: null }];
    const picked = pick?.pickerToolCallId === panel.pickerToolCallId ? panel.options.find((o) => o.id === pick.optionId) : undefined;
    return [{ panel, answer: picked?.label ?? textOf(reply) }];
  });
}

/** The panel still waiting for an answer: the newest message's, when no user message follows it. */
export function openPanelOf(messages: MessageLike[]): OptionsPanel | null {
  const last = messages.length - 1;
  const found = panelsOf(messages, last).filter((x) => x.answer === null);
  return found.at(-1)?.panel ?? null;
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6,
};
const CARDINALS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const STOP = new Set(["the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with", "that", "this", "it", "is", "i", "my", "your", "about", "one", "idea", "angle", "option", "post"]);

const normalize = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9#' ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => normalize(s).split(" ").filter((t) => t && !STOP.has(t));

/** The 1-based position a short reply names ("2", "#2", "2nd", "second", "option 2", "the second one", "idea three", "last one"), or null. */
function ordinalOf(text: string, count: number): number | null {
  let t = normalize(text);
  t = t.replace(/^(?:i(?:'ll| will| would|'d)? (?:go with|pick|choose|take|like|prefer)|go with|let's (?:go with|do)|lets (?:go with|do)|pick|choose|take|use)\s+/, "");
  t = t.replace(/^(?:the|my|number|no)\s+/, "");
  const labelled = /^(?:option|idea|angle|number|no|#)\s*/.exec(t);
  if (labelled) t = t.slice(labelled[0].length);
  t = t.replace(/^#\s*/, "").replace(/\s+(?:one|option|idea|angle)$/, "").trim();
  if (t === "last") return count;
  if (/^[1-9]$/.test(t)) return Number(t);
  if (ORDINALS[t]) return ORDINALS[t]!;
  if (labelled && CARDINALS[t]) return CARDINALS[t]!;
  return null;
}

/**
 * The option a typed reply to an open picker means: an ordinal ("2nd", "option 2") or a unique clear match to one option's
 * label. Null for anything else (the user's own answer), for an ordinal out of range and for an ambiguous match.
 */
export function matchTypedAnswer(options: { id: string; label: string }[], text: string): string | null {
  const n = ordinalOf(text, options.length);
  if (n !== null) return options[n - 1]?.id ?? null;
  const typed = normalize(text);
  const typedTokens = tokens(text);
  if (typed.length < 4 || typedTokens.length === 0) return null;
  const hits = options.filter((o) => {
    const label = normalize(o.label);
    if (label.includes(typed)) return true;
    if (typed.includes(label) && typed.length <= label.length * 1.6 + 20) return true;
    const labelTokens = new Set(tokens(o.label));
    if (labelTokens.size === 0) return false;
    const shared = typedTokens.filter((t) => labelTokens.has(t)).length;
    return typedTokens.length >= 2 && shared / typedTokens.length >= 0.85 && shared / labelTokens.size >= 0.5;
  });
  return hits.length === 1 ? hits[0]!.id : null;
}

