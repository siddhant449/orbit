/**
 * The deterministic validator (design §4.2). `lintPost` measures a post and lists what breaks the effective rules.
 * Hard violations must be fixed (the polish pass does it, Task W6); target ones are fixed if cheap and reported; advice is
 * only reported. Pure: no database, no model.
 */
import { bannedMatches, MARKDOWN, PLACEHOLDER } from "./patterns";
import { extractNumbers, isListLine, measurePost, splitBlocks, type PostMetrics } from "./measure";
import type { EffectiveRules, PostType } from "./rules";

export type LintId =
  | "emoji" | "dashes" | "hashtags" | "postscript" | "links" | "banned-phrase" | "rhetorical-opening"
  | "block-lines" | "hook-length" | "fold" | "one-line-blocks" | "list-adjacency" | "post-length" | "list-expected"
  | "number-provenance" | "date-provenance" | "first-person" | "placeholders" | "markdown";

export type Violation = { id: LintId; level: "hard" | "target" | "advice"; detail: string; block: number | null };

export type LintContext = {
  postType: PostType | null;
  /** The rendered grounding plus the request: every number in the post must be found in it. Null skips the check. */
  groundingText: string | null;
  /** ISO dates of the research items: every date in the post must be one of them or appear in the grounding. Null skips the check. */
  researchDates: string[] | null;
  personalDetails: "allowed" | "none";
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_RES = [
  new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b\\.?(?:,?\\s+\\d{4})?`, "gi"),
  new RegExp(`\\b${MONTH}\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, "gi"),
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
];

/** Calendar dates in a text as "day-month" keys (the year is ignored), with the text they were found in. */
export function datesIn(text: string): { key: string; raw: string }[] {
  const out: { key: string; raw: string }[] = [];
  const [dm, md, iso] = DATE_RES;
  for (const m of text.matchAll(dm!)) out.push({ key: `${Number(m[1])}-${MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase())}`, raw: m[0] });
  for (const m of text.matchAll(md!)) out.push({ key: `${Number(m[2])}-${MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase())}`, raw: m[0] });
  for (const m of text.matchAll(iso!)) out.push({ key: `${Number(m[3])}-${Number(m[2]) - 1}`, raw: m[0] });
  return out;
}

const stripDates = (text: string) => DATE_RES.reduce((t, re) => t.replace(re, " "), text);
const core = (n: string) => n.replace(/[^\d.]/g, "").replace(/\.$/, "");

const FIRST_PERSON_VERB =
  /\b(?:I|[Ww]e)(?:'ve|'d|'ll)?\s+(?:\w+\s+)?(?:hired|built|launched|founded|started|lost|raised|sold|learned|spent|made|grew|failed|shipped|joined|quit|left|cut|scaled|tried|saw|met|worked|ran|led|managed|interviewed)\b/;
const FIRST_PERSON_POSSESSIVE = /\b(?:my|our) (?:client|clients|team|co-?founder|first|company|startup|customer|customers|boss|manager|mentor|business|last|former|previous)\b/i;

const MAX_LENGTH = 3_000;

export function lintPost(text: string, rules: EffectiveRules, ctx: LintContext): { metrics: PostMetrics; violations: Violation[] } {
  const m = measurePost(text);
  const blocks = splitBlocks(text);
  const { hard, targets } = rules;
  const v: Violation[] = [];
  const add = (id: LintId, level: Violation["level"], detail: string, block: number | null = null) => v.push({ id, level, detail, block });
  const hook = blocks[0];

  // Character-level rules.
  if (m.emoji.count > 0) {
    if (hard.forbidEmoji) add("emoji", "hard", `${m.emoji.count} emoji, but your rules forbid them`);
    else if (rules.styled && m.emoji.count > Math.ceil(targets.emoji.perPost * 1.5)) add("emoji", "target", `${m.emoji.count} emoji; this style uses about ${targets.emoji.perPost} per post`);
  }
  if (m.dashes > 0 && hard.forbidDashes) add("dashes", "hard", `${m.dashes} dash${m.dashes === 1 ? "" : "es"}, but your rules forbid them`);
  if (m.hashtags > 0 && hard.forbidHashtags) add("hashtags", "hard", `${m.hashtags} hashtag${m.hashtags === 1 ? "" : "s"}, but your rules forbid them`);
  else if (m.hashtags > hard.maxHashtags) add("hashtags", "hard", `${m.hashtags} hashtags (limit ${hard.maxHashtags})`);
  if (m.postscript) {
    if (hard.forbidPostscript) add("postscript", "hard", "Ends with a P.S., but your rules forbid it", blocks.length - 1);
    else if (rules.styled && targets.postscriptPercent === 0) add("postscript", "target", "Ends with a P.S., which this style does not use", blocks.length - 1);
  }
  const linkText = hard.sourcesInPost && /^sources?\s*:/i.test(blocks.at(-1)?.lines[0] ?? "") ? blocks.slice(0, -1).map((b) => b.lines.join("\n")).join("\n\n") : text;
  const links = measurePost(linkText).links;
  if (hard.forbidLinks && links > 0) add("links", "hard", `${links} link${links === 1 ? "" : "s"}, but your rules forbid them`);
  const banned = bannedMatches(text, hard.bannedPhrases);
  if (banned.length) add("banned-phrase", "hard", `Uses banned words: ${banned.join(", ")}`);
  if (hard.forbidRhetoricalOpening && hook && /\?\s*$/.test(hook.lines[0] ?? "")) add("rhetorical-opening", "hard", "Opens with a question, but your rules forbid a rhetorical opening", 0);
  if (text.match(PLACEHOLDER)) add("placeholders", "hard", "A placeholder is left in the text");
  if (text.match(MARKDOWN)) add("markdown", "hard", "Has markdown (bold, headings or code fences)");

  // Layout.
  blocks.forEach((b, i) => {
    if (b.kind !== "prose") return;
    if (hard.maxBlockLines !== null && b.mobileLines > hard.maxBlockLines) add("block-lines", "hard", `Block ${i + 1} is ${b.mobileLines} lines on a phone; your rules allow ${hard.maxBlockLines}`, i);
    else if (hard.maxBlockLines === null && b.mobileLines > 4) add("block-lines", "target", `Block ${i + 1} is ${b.mobileLines} lines on a phone; split it`, i);
  });
  if (hook) {
    if (m.hookMobileLines > 2) add("hook-length", "hard", `The opening is ${m.hookMobileLines} lines on a phone; keep it to one or two`, 0);
    else if (m.hookChars > targets.hookChars.high) add("hook-length", "target", `The opening is ${m.hookChars} characters; aim for ${targets.hookChars.low}-${targets.hookChars.high}`, 0);
    if (!m.promiseBeforeFold) add("fold", "target", "The promise comes after the \"see more\" fold", 0);
  }
  if (m.blocks >= 6 && m.oneLineBlockShare > 0.85) add("one-line-blocks", "target", "Nearly every sentence is its own block; group two or three related lines");
  for (let i = 1; i < blocks.length; i++) {
    const a = blocks[i - 1]!;
    const b = blocks[i]!;
    if (a.lines.length === 1 && b.lines.length === 1 && isListLine(a.lines[0]!) && isListLine(b.lines[0]!)) add("list-adjacency", "hard", `A blank line separates list items (blocks ${i} and ${i + 1})`, i);
  }
  if (m.chars > MAX_LENGTH) add("post-length", "hard", `${m.chars.toLocaleString("en-US")} characters (limit 3,000)`);
  else if (m.chars > 0 && (m.chars < targets.postChars.low * 0.85 || m.chars > targets.postChars.high * 1.15))
    add("post-length", "target", `${m.chars} characters; this style runs ${targets.postChars.low}-${targets.postChars.high}`);
  if ((ctx.postType === "framework" || ctx.postType === "how-to") && m.bulletLists + m.numberedLists === 0) add("list-expected", "advice", "A framework or how-to post reads best with a list");

  // Provenance.
  if (ctx.groundingText !== null) {
    const known = new Set(extractNumbers(stripDates(ctx.groundingText)).map(core));
    const unsupported = extractNumbers(stripDates(text)).filter((n) => !known.has(core(n)));
    if (unsupported.length) add("number-provenance", "hard", `Not in the request or your material: ${[...new Set(unsupported)].join(", ")}`);
  }
  if (ctx.researchDates !== null) {
    const allowed = new Set([...ctx.researchDates.flatMap((d) => datesIn(d).map((x) => x.key)), ...datesIn(ctx.groundingText ?? "").map((x) => x.key)]);
    const stray = datesIn(text).filter((d) => !allowed.has(d.key));
    if (stray.length) add("date-provenance", "hard", `A date that matches no research item: ${[...new Set(stray.map((d) => d.raw.trim()))].join(", ")}`);
  }
  if (ctx.personalDetails === "none" && (FIRST_PERSON_VERB.test(text) || FIRST_PERSON_POSSESSIVE.test(text))) {
    add("first-person", "hard", "Claims a personal experience, but this post is written without personal details");
  }
  return { metrics: m, violations: v };
}
