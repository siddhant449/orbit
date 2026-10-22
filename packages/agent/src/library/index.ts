import { HOOK_PURPOSES, HOOK_PURPOSE_IDS, type HookPurpose } from "./purposes";
import type { HardRules } from "../writing/rules";

export * from "./purposes";
export * from "./frameworks";
export * from "./categories";
export * from "./templates";

/** A small deterministic hash so the same seed always picks the same purposes. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * Distinct purposes for one set of hooks (design §5): never repeats within a set, avoids `recent` (the last set in this chat)
 * until the rest are used up, and is deterministic for a seed. With count >= 3 it returns at least 3 distinct purposes.
 */
export function pickPurposes(input: { count: number; available: Set<HookPurpose>; recent: HookPurpose[]; seed: string }): HookPurpose[] {
  const order = (ids: HookPurpose[]) => [...ids].sort((a, b) => hash(`${input.seed}:${a}`) - hash(`${input.seed}:${b}`));
  const pool = HOOK_PURPOSE_IDS.filter((p) => input.available.has(p));
  const fresh = order(pool.filter((p) => !input.recent.includes(p)));
  const stale = order(pool.filter((p) => input.recent.includes(p)));
  return [...fresh, ...stale].slice(0, input.count);
}

export type SkippedPurpose = { purpose: HookPurpose; reason: string };

/** Which purposes the evidence allows. A purpose that implies a fact the user has not supplied is skipped, with the reason. */
export function gatePurposes(
  evidence: { hasStory: boolean; numbers: string[]; hasNews: boolean },
  rules: Pick<HardRules, "forbidRhetoricalOpening">,
): { available: Set<HookPurpose>; skipped: SkippedPurpose[] } {
  const available = new Set<HookPurpose>();
  const skipped: SkippedPurpose[] = [];
  for (const p of HOOK_PURPOSES) {
    let reason: string | null = null;
    if (p.evidence === "story" && !evidence.hasStory) reason = "needs a story from you";
    else if (p.evidence === "number" && evidence.numbers.length === 0) reason = "needs a number from you";
    else if (p.evidence === "news" && !evidence.hasNews) reason = "needs news from you";
    else if (p.id === "question" && rules.forbidRhetoricalOpening) reason = "your rules forbid a question opening";
    if (reason) skipped.push({ purpose: p.id, reason });
    else available.add(p.id);
  }
  return { available, skipped };
}
