import { looksLikeRefusal } from "@brandloop/ai";

export const FACT_MIN_CHARS = 8;
export const FACT_MAX_CHARS = 500;

export type FactCheck = { ok: true; text: string } | { ok: false; reason: "refusal" | "too_short" | "too_long" };

/**
 * The memory write guard (design §6.5) for one fact. Kleo saved its own refusals as memory;
 * this stops assistant-like text (meta replies, questions) and out-of-range lengths.
 */
export function checkMemoryFact(text: string): FactCheck {
  const clean = text.trim();
  if (clean.length < FACT_MIN_CHARS) return { ok: false, reason: "too_short" };
  if (clean.length > FACT_MAX_CHARS) return { ok: false, reason: "too_long" };
  if (looksLikeRefusal(clean)) return { ok: false, reason: "refusal" };
  return { ok: true, text: clean };
}
