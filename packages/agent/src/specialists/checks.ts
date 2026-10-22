/**
 * The final review's deterministic checks (design §6.3). Run by the server before the model review; their
 * results overwrite whatever the model reported, so a model can't wave a 3,001-character post through.
 */

import { lintPost, type LintContext, type LintId } from "../writing/lint";
import { bannedMatches, bannedWordsFromRules, MARKDOWN, PLACEHOLDER } from "../writing/patterns";
import type { EffectiveRules } from "../writing/rules";
export { bannedMatches, bannedWordsFromRules };

export const CHECK_IDS = ["length", "hook-length", "hashtags", "banned-words", "placeholders", "markdown", "links", "emoji"] as const;
/** Ids the writing checks add (Task W2); the ones already in CHECK_IDS (emoji, hashtags, links, hook-length) are merged into those results. */
export const WRITING_CHECK_IDS = ["dashes", "postscript", "rhetorical-opening", "block-lines", "list-adjacency", "number-provenance", "date-provenance", "first-person"] as const;
export type CheckId = (typeof CHECK_IDS)[number] | (typeof WRITING_CHECK_IDS)[number];
export type CheckResult = { id: CheckId; passed: boolean; detail: string };

export const CHECK_LIMITS = { length: 3_000, hook: 200, hashtags: 3, links: 1, emoji: 5 } as const;

const HASHTAG = /(?:^|\s)#(?!\d)[\p{L}\p{N}_]+/gu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;
const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The 8 checks, always in `CHECK_IDS` order. */
export function runDeterministicChecks(text: string, rules: { bannedWords: string[] }): CheckResult[] {
  const length = text.length;
  const hook = text.split("\n").find((l) => l.trim()) ?? "";
  const hashtags = count(text, HASHTAG);
  const banned = bannedMatches(text, rules.bannedWords);
  const placeholders = text.match(PLACEHOLDER) ?? [];
  const markdown = count(text, MARKDOWN);
  const links = count(text, URL);
  const emoji = count(text, EMOJI);
  const L = CHECK_LIMITS;
  return [
    { id: "length", passed: length <= L.length, detail: `${plural(length, "character")} (limit ${L.length.toLocaleString("en-US")})` },
    { id: "hook-length", passed: hook.trim().length <= L.hook, detail: `First line is ${plural(hook.trim().length, "character")} (limit ${L.hook})` },
    { id: "hashtags", passed: hashtags <= L.hashtags, detail: `${plural(hashtags, "hashtag")} (limit ${L.hashtags})` },
    {
      id: "banned-words",
      passed: banned.length === 0,
      detail: banned.length === 0 ? "No banned words" : `Uses banned words: ${banned.join(", ")}`,
    },
    {
      id: "placeholders",
      passed: placeholders.length === 0,
      detail: placeholders.length === 0 ? "No placeholders" : `Placeholders left in: ${[...new Set(placeholders)].slice(0, 5).join(", ")}`,
    },
    { id: "markdown", passed: markdown === 0, detail: markdown === 0 ? "Plain text" : "Has markdown (bold, headings or code fences)" },
    { id: "links", passed: links <= L.links, detail: `${plural(links, "link")} (limit ${L.links})` },
    { id: "emoji", passed: emoji <= L.emoji, detail: `${plural(emoji, "emoji", "emoji")} (limit ${L.emoji})` },
  ];
}

/** Lint ids that the 8 deterministic checks, or the banned-words check, already cover. */
const COVERED: ReadonlySet<LintId> = new Set(["banned-phrase", "placeholders", "markdown", "post-length"]);

/**
 * The writing checks (design §4.2): one result per hard rule the user set (passing or failing), plus a failing result
 * for any other hard violation. Target and advice findings are not checks; they go to the envelope's findings (Task W6).
 */
export function runWritingChecks(text: string, rules: EffectiveRules, ctx: LintContext): CheckResult[] {
  const { violations } = lintPost(text, rules, ctx);
  const hard = violations.filter((v) => v.level === "hard" && !COVERED.has(v.id));
  const enforced: LintId[] = [];
  const h = rules.hard;
  if (h.forbidEmoji) enforced.push("emoji");
  if (h.forbidDashes) enforced.push("dashes");
  if (h.forbidHashtags) enforced.push("hashtags");
  if (h.forbidPostscript) enforced.push("postscript");
  if (h.forbidLinks) enforced.push("links");
  if (h.forbidRhetoricalOpening) enforced.push("rhetorical-opening");
  if (h.maxBlockLines !== null) enforced.push("block-lines");
  if (ctx.groundingText !== null) enforced.push("number-provenance");
  if (ctx.researchDates !== null) enforced.push("date-provenance");
  if (ctx.personalDetails === "none") enforced.push("first-person");
  const ids = [...new Set<LintId>([...enforced, ...hard.map((v) => v.id)])];
  return ids.map((id) => {
    const failed = hard.filter((v) => v.id === id);
    return {
      id: id as CheckId,
      passed: failed.length === 0,
      detail: failed.length ? failed.map((v) => v.detail).join("; ") : WRITING_PASS[id] ?? "Passed",
    };
  });
}

const WRITING_PASS: Partial<Record<LintId, string>> = {
  emoji: "No emoji",
  dashes: "No dashes",
  hashtags: "No hashtags",
  postscript: "No P.S.",
  links: "No links",
  "rhetorical-opening": "No rhetorical opening",
  "block-lines": "Blocks fit your line limit",
  "number-provenance": "Every number comes from your material",
  "date-provenance": "Every date matches the research",
  "first-person": "No personal-experience claims",
};

/** The 8 checks keep their ids and order. A writing result with the same id makes it stricter; new ids go on the end. */
export function mergeChecks(base: CheckResult[], writing: CheckResult[]): CheckResult[] {
  const merged = base.map((b) => {
    const w = writing.find((x) => x.id === b.id);
    return w ? { id: b.id, passed: b.passed && w.passed, detail: w.passed ? b.detail : w.detail } : b;
  });
  return [...merged, ...writing.filter((w) => !base.some((b) => b.id === w.id))];
}
