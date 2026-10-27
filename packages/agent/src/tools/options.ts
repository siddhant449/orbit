import { tool } from "ai";
import { z } from "zod";
import { parseOptionsPanel, matchTypedAnswer } from "../client/options";
import { CATEGORIES } from "../library/categories";

const OptionInput = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  explainer: z.string().min(1).max(240),
  /** The detailed writing instructions for this option. Stays on the server: never part of the tool's output. */
  brief: z.string().min(1).max(2_000),
  /** The kind of post this angle is (a category id from the template library), or null. Steers which template the writer gets. Stays on the server. */
  category: z.string().max(40).nullable(),
  /** A short source badge ("From your knowledge base"), shown beside the label, or null. */
  badge: z.string().max(60).nullable().optional(),
});

export const PresentOptionsInput = z
  .object({
    preamble: z.string().max(300).nullable(),
    question: z.string().min(1).max(200),
    options: z.array(OptionInput).min(2).max(5),
    recommendedOptionId: z.string().nullable(),
    allowFreeInput: z.boolean().nullable(),
    freeInputPlaceholder: z.string().max(120).nullable(),
  })
  .refine((v) => new Set(v.options.map((o) => o.id)).size === v.options.length, { message: "option ids must be unique", path: ["options"] })
  .refine((v) => !v.recommendedOptionId || v.options.some((o) => o.id === v.recommendedOptionId), {
    message: "recommendedOptionId must be one of the option ids",
    path: ["recommendedOptionId"],
  });
// Fields are nullable rather than optional so the schema works in OpenAI strict mode, like the other tools.
export type PresentOptionsInput = z.infer<typeof PresentOptionsInput>;

/** What the picker UI gets: everything but the briefs. */
export type PresentOptionsOutput = {
  shown: true;
  preamble: string | null;
  question: string;
  options: { id: string; label: string; explainer: string; badge?: string }[];
  recommendedOptionId: string | null;
  allowFreeInput: boolean;
  freeInputPlaceholder: string;
};

export const DEFAULT_FREE_INPUT_PLACEHOLDER = "Or tell me something else…";

export function presentOptionsOutput(input: PresentOptionsInput): PresentOptionsOutput {
  return {
    shown: true,
    preamble: input.preamble?.trim() || null,
    question: input.question,
    options: input.options.map(({ id, label, explainer, badge }) => ({ id, label, explainer, ...(badge ? { badge } : {}) })),
    recommendedOptionId: input.recommendedOptionId ?? null,
    allowFreeInput: input.allowFreeInput ?? true,
    freeInputPlaceholder: input.freeInputPlaceholder?.trim() || DEFAULT_FREE_INPUT_PLACEHOLDER,
  };
}

const STOP_AND_WAIT = "The picker is on the user's screen. Stop now and wait for their answer: do not list the options in text.";

/**
 * What the model sees of a picker it showed: the question and the numbered options (label, why it works, source badge), never
 * the hidden briefs. This is also what later turns see, so "the second one" can be read against it.
 */
export function pickerModelText(output: unknown): string {
  if (typeof output === "string") return output;
  const o = output as { question?: unknown; options?: { label?: unknown; explainer?: unknown; badge?: unknown }[] } | null;
  if (!o || typeof o.question !== "string" || !Array.isArray(o.options)) return STOP_AND_WAIT;
  const rows = o.options.map((x, i) => `${i + 1}. ${String(x?.label ?? "")}${typeof x?.badge === "string" && x.badge ? ` [${x.badge}]` : ""}${typeof x?.explainer === "string" && x.explainer ? ` (${x.explainer})` : ""}`);
  return `Shown to the user: "${o.question}"\n${rows.join("\n")}\n${STOP_AND_WAIT}`;
}

export type OptionPick = { pickerToolCallId: string; optionId: string };
export type PickedAngle = { question: string; label: string; brief: string; category: string | null };

type StoredMessage = { role: string; parts: unknown };

/**
 * The option a user picked, read from the picker's STORED tool call. The client only names the picker and the
 * option; the label and the brief always come from what the assistant stored, never from the request.
 */
export function resolveOptionPick(messages: StoredMessage[], pick: OptionPick | null | undefined): PickedAngle | null {
  if (!pick) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant" || !Array.isArray(m.parts)) continue;
    for (const part of m.parts as { type?: unknown; toolCallId?: unknown; input?: unknown; output?: unknown }[]) {
      if (part?.toolCallId !== pick.pickerToolCallId) continue;
      // The ideas step stores its picker as its own output (labels, and the hidden briefs next to them).
      if (part.type === "tool-generateIdeas") return resolveIdeaPick(part.output, pick.optionId);
      if (part.type !== "tool-presentOptions") continue;
      // Pickers stored before options had a category have none: read that as null.
      const raw = part.input as { options?: unknown } | null;
      const input = raw && Array.isArray(raw.options) ? { ...raw, options: raw.options.map((o) => ({ category: null, ...(o as object) })) } : part.input;
      const parsed = PresentOptionsInput.safeParse(input);
      if (!parsed.success) return null;
      const option = parsed.data.options.find((o) => o.id === pick.optionId);
      return option ? { question: parsed.data.question, label: option.label, brief: option.brief, category: CATEGORIES.some((c) => c.id === option.category) ? option.category : null } : null;
    }
  }
  return null;
}

/** The picked idea from a stored `generateIdeas` output: the label as shown, the brief as the server wrote it. */
function resolveIdeaPick(output: unknown, optionId: string): PickedAngle | null {
  const o = output as { question?: unknown; options?: { id?: unknown; label?: unknown }[]; briefs?: Record<string, { brief?: unknown; category?: unknown } | undefined> } | null;
  if (!o || typeof o.question !== "string" || !Array.isArray(o.options)) return null;
  const option = o.options.find((x) => x?.id === optionId);
  const hidden = o.briefs?.[optionId];
  if (!option || typeof option.label !== "string" || typeof hidden?.brief !== "string") return null;
  return { question: o.question, label: option.label, brief: hidden.brief, category: typeof hidden.category === "string" && CATEGORIES.some((c) => c.id === hidden.category) ? hidden.category : null };
}

export function optionTools() {
  return {
    presentOptions: tool({
      description:
        `Ask the user to choose between options, shown as a panel above their message box. Use it for a new post when the user gave only a topic: offer 3 or 4 distinct angles. \`question\` is the heading. Each option has a short \`label\`, a one-line \`explainer\` of why it works, and a hidden \`brief\`: complete writing instructions for that angle, grounded in what you know about the user, never inventing personal facts, and a \`category\` (the kind of post that angle is, one of: ${CATEGORIES.map((c) => c.id).join(", ")}; null if none fits). Set \`recommendedOptionId\` to the best fit (null if none). Pass null for fields you do not need; allowFreeInput null means true. The turn ends after this call: add at most the one-sentence \`preamble\`, never list the options in text.`,
      inputSchema: PresentOptionsInput,
      execute: (input) => presentOptionsOutput(input),
      toModelOutput: ({ output }) => ({ type: "text", value: pickerModelText(output) }),
    }),
  };
}

/**
 * A typed reply to the picker the newest assistant message left open ("2nd", "option 2", a clear match to one label), as the
 * pick a click would have sent. Null when the reply is anything else: that stays the user's own answer.
 */
export function resolveTypedPick(messages: { id: string; role: string; parts: unknown }[], requestMessageId: string, text: string): OptionPick | null {
  const at = messages.findIndex((m) => m.id === requestMessageId);
  const prev = at > 0 ? messages[at - 1] : null;
  if (!prev || prev.role !== "assistant" || !Array.isArray(prev.parts)) return null;
  const panels = (prev.parts as { type: string; state?: string; toolCallId?: string; output?: unknown }[]).flatMap((p) => {
    const panel = parseOptionsPanel(p);
    return panel ? [panel] : [];
  });
  const panel = panels.at(-1);
  if (!panel) return null;
  const optionId = matchTypedAnswer(panel.options, text);
  return optionId ? { pickerToolCallId: panel.pickerToolCallId, optionId } : null;
}
