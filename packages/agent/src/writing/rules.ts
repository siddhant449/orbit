/**
 * Rule precedence (design §3.1), strongest first: the instruction in this turn, the user's saved hard rules, the user's
 * soft rules, the selected style's rules, the style's measured targets, Orbit's defaults. Pure: the writer, the
 * validator, the final review and the Memories screen all read the same `EffectiveRules`.
 */
import { bannedWordsFromRules } from "./patterns";
import type { PostType } from "@brandloop/ai/style";
import type { LayoutTargets } from "./measure";

export type { PostType } from "@brandloop/ai/style";

export type HardRules = {
  forbidEmoji: boolean;
  forbidDashes: boolean;
  forbidHashtags: boolean;
  maxHashtags: number;
  forbidPostscript: boolean;
  maxBlockLines: number | null;
  bannedPhrases: string[];
  forbidRhetoricalOpening: boolean;
  forbidLinks: boolean;
  spelling: "en-GB" | "en-US" | null;
  sourcesInPost: boolean;
};

export const DEFAULT_HARD_RULES: HardRules = {
  forbidEmoji: false,
  forbidDashes: false,
  forbidHashtags: false,
  maxHashtags: 3,
  forbidPostscript: false,
  maxBlockLines: null,
  bannedPhrases: [],
  forbidRhetoricalOpening: false,
  forbidLinks: false,
  spelling: null,
  sourcesInPost: false,
};

/** Orbit's defaults, from the band of Kleo's best drafts (K1, K8, K9): 40-60 character hooks, 650-1,300 characters, 6-11 blocks. */
export const DEFAULT_TARGETS: LayoutTargets = {
  hookChars: { low: 40, typical: 50, high: 60 },
  hookMobileLines: { low: 1, typical: 1, high: 2 },
  postChars: { low: 650, typical: 900, high: 1300 },
  blocks: { low: 6, typical: 8, high: 11 },
  blockLineMix: { one: 35, two: 40, threePlus: 25 },
  proseBlockChars: { low: 60, typical: 150, high: 260 },
  sentenceWords: { low: 4, typical: 9, high: 18 },
  listPosts: { bullet: 30, numbered: 20 },
  emoji: { perPost: 0, positions: [] },
  hashtagsPerPost: 0,
  postscriptPercent: 0,
  linkPercent: 0,
  endings: { question: 20, rule: 40, cta: 10, statement: 30, sources: 0 },
};

export type RuleMatch = { rule: keyof HardRules; line: string };

const NEG = /\b(no|never|don'?t|do not|dont|avoid|without|stop|zero|skip|not)\b/i;
const LIMITER = /walls? of text|≤|<=|\bmax(?:imum)?\b|at most|no more than|up to|\bunder\b|\bno\b|>/i;

const stripMarker = (line: string) => line.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, "").trim();
const isHeading = (line: string) => /^\s{0,3}#{1,6}\s/.test(line);

/** Which rules one line of the user's writing rules states. Deterministic and case-insensitive. */
function rulesInLine(raw: string): { rule: keyof HardRules; value?: unknown }[] {
  const line = stripMarker(raw);
  const out: { rule: keyof HardRules; value?: unknown }[] = [];
  const neg = NEG.test(line);
  if (neg && /\bemoji|emoticon/i.test(line)) out.push({ rule: "forbidEmoji" });
  if (neg && /\b(?:em|en)[\s-]?dash(?:es)?\b|\bdashes\b|—/i.test(line)) out.push({ rule: "forbidDashes" });
  const maxTags = /(?:no more than|max(?:imum)?(?: of)?|up to|at most)\s*(\d+)\s*hashtags?/i.exec(line);
  if (maxTags) out.push({ rule: "maxHashtags", value: Number(maxTags[1]) });
  else if (neg && /hashtags?/i.test(line)) out.push({ rule: "forbidHashtags" });
  if (neg && /(?:^|[^\p{L}])p\.?\s?s\.?(?![\p{L}])|postscript/iu.test(line)) out.push({ rule: "forbidPostscript" });
  const lines = /(\d+)\s*(?:mobile\s+)?lines?\b/i.exec(line) ?? />\s*(\d+)/.exec(line);
  if (lines && LIMITER.test(line) && /lines?|walls? of text|paragraph|block/i.test(line)) out.push({ rule: "maxBlockLines", value: Number(lines[1]) });
  if (/\bbritish\b|\buk english\b|\ben-gb\b/i.test(line)) out.push({ rule: "spelling", value: "en-GB" });
  else if (/\bamerican (?:english|spelling)\b|\bus english\b|\ben-us\b/i.test(line)) out.push({ rule: "spelling", value: "en-US" });
  if (neg && /rhetorical/i.test(line)) out.push({ rule: "forbidRhetoricalOpening" });
  if (neg && /\b(?:links?|urls?)\b/i.test(line) && !/\bsources?\b/i.test(line)) out.push({ rule: "forbidLinks" });
  if (!neg && /sources?\s+line|cite\s+(?:your\s+)?sources|include\s+sources/i.test(line)) out.push({ rule: "sourcesInPost" });
  return out;
}

/** Lines under a heading that mentions "banned" belong to bannedWordsFromRules, not to the soft rules. */
function ruleLines(markdown: string): string[] {
  const out: string[] = [];
  let banned = false;
  for (const line of markdown.split("\n")) {
    if (isHeading(line)) {
      banned = /banned/i.test(line);
      continue;
    }
    if (banned || !line.trim()) continue;
    out.push(line);
  }
  return out;
}

export function compileHardRules(markdown: string): { rules: HardRules; matched: RuleMatch[] } {
  const rules: HardRules = { ...DEFAULT_HARD_RULES, bannedPhrases: bannedWordsFromRules(markdown) };
  const matched: RuleMatch[] = [];
  for (const raw of ruleLines(markdown)) {
    for (const { rule, value } of rulesInLine(raw)) {
      (rules as Record<string, unknown>)[rule] = value ?? true;
      matched.push({ rule, line: stripMarker(raw) });
    }
  }
  if (rules.bannedPhrases.length) matched.push({ rule: "bannedPhrases", line: `Banned words: ${rules.bannedPhrases.join(", ")}` });
  return { rules, matched };
}

export type TurnOverrides = {
  allowEmoji: boolean | null;
  allowHashtags: boolean | null;
  allowDashes: boolean | null;
  allowPostscript: boolean | null;
  allowLinks: boolean | null;
};

const OVERRIDE_WORDS: Record<keyof TurnOverrides, RegExp> = {
  allowEmoji: /emoji|emoticon/i,
  allowHashtags: /hashtag/i,
  allowDashes: /dash/i,
  allowPostscript: /(?:^|[^\p{L}])p\.?\s?s\.?(?![\p{L}])|postscript/iu,
  allowLinks: /\blinks?\b|\burls?\b/i,
};

/** A model-proposed override counts only when the user's own message names it. Never pass tool output as `latestUserText`. */
export function acceptOverrides(o: TurnOverrides | null, latestUserText: string): Partial<TurnOverrides> {
  const out: Partial<TurnOverrides> = {};
  if (!o) return out;
  for (const key of Object.keys(OVERRIDE_WORDS) as (keyof TurnOverrides)[]) {
    if (o[key] === true && OVERRIDE_WORDS[key].test(latestUserText)) out[key] = true;
  }
  return out;
}

type DoDont = { do: string[]; dont: string[] };
/** The parts of a compiled style profile the rules look at (Task W3's `StyleProfile` satisfies it). */
export type StyleLike = {
  layout: LayoutTargets;
  rules: Record<string, DoDont>;
  signatureMoves: { label: string; pattern: string; useWhen: string }[];
};

export type SoftRule = { source: "turn" | "user" | "style" | "default"; text: string };

export type EffectiveRules = {
  hard: HardRules;
  targets: LayoutTargets;
  soft: SoftRule[];
  dropped: { text: string; reason: string }[];
  overrides: Partial<TurnOverrides>;
  /** True when a compiled style supplied the targets (otherwise they are Orbit's defaults). */
  styled: boolean;
};

/** Why a style rule or move cannot reach the writer, or null when it is compatible with the hard rules. */
export function conflictWith(text: string, hard: HardRules): string | null {
  if (hard.forbidEmoji && /emoji|emoticon|[\u{1F300}-\u{1FAFF}☀-➿]/u.test(text)) return "your rules forbid emoji";
  if (hard.forbidPostscript && /(?:^|[^\p{L}])p\.?\s?s\.?(?![\p{L}])|postscript/iu.test(text)) return "your rules forbid a P.S.";
  if (hard.forbidHashtags && /hashtag|#[a-z]/i.test(text)) return "your rules forbid hashtags";
  if (hard.forbidDashes && /dash|—|–/i.test(text)) return "your rules forbid dashes";
  if (hard.forbidLinks && /\blinks?\b|\burls?\b/i.test(text)) return "your rules forbid links";
  if (hard.forbidRhetoricalOpening && /rhetorical|open(?:ing|s)?\s+(?:with\s+)?a\s+question|question hook/i.test(text)) return "your rules forbid a rhetorical opening";
  const banned = hard.bannedPhrases.find((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text));
  if (banned) return `"${banned}" is a banned word`;
  return null;
}

const CATEGORY_LABEL: Record<string, string> = {
  hooks: "Hooks",
  rhythm: "Rhythm",
  formatting: "Formatting",
  diction: "Word choice",
  closings: "Closings",
  global: "Overall",
};

export function resolveRules(input: { userRulesMarkdown: string; style: StyleLike | null; turn: Partial<TurnOverrides> }): EffectiveRules {
  const { rules: saved } = compileHardRules(input.userRulesMarkdown);
  const hard: HardRules = { ...saved };
  const overrides: Partial<TurnOverrides> = {};
  const t = input.turn;
  if (t.allowEmoji) (hard.forbidEmoji = false), (overrides.allowEmoji = true);
  if (t.allowHashtags) (hard.forbidHashtags = false), (overrides.allowHashtags = true);
  if (t.allowDashes) (hard.forbidDashes = false), (overrides.allowDashes = true);
  if (t.allowPostscript) (hard.forbidPostscript = false), (overrides.allowPostscript = true);
  if (t.allowLinks) (hard.forbidLinks = false), (overrides.allowLinks = true);

  const base = input.style?.layout ?? DEFAULT_TARGETS;
  const targets: LayoutTargets = structuredClone(base);
  if (hard.forbidEmoji) (targets.emoji.perPost = 0), (targets.emoji.positions = []);
  else if (overrides.allowEmoji && targets.emoji.perPost < 2) (targets.emoji.perPost = 2), (targets.emoji.positions = targets.emoji.positions.length ? targets.emoji.positions : ["line-end"]);
  if (hard.forbidHashtags) targets.hashtagsPerPost = 0;
  else if (overrides.allowHashtags) targets.hashtagsPerPost = Math.max(targets.hashtagsPerPost, 2);
  if (hard.forbidPostscript) targets.postscriptPercent = 0;
  else if (overrides.allowPostscript) targets.postscriptPercent = Math.max(targets.postscriptPercent, 100);
  if (hard.forbidLinks) targets.linkPercent = 0;
  if (hard.maxBlockLines !== null && hard.maxBlockLines <= 2) targets.blockLineMix = { ...targets.blockLineMix, threePlus: 0 };

  const soft: SoftRule[] = [];
  const dropped: { text: string; reason: string }[] = [];
  for (const raw of ruleLines(input.userRulesMarkdown)) {
    if (rulesInLine(raw).length) continue;
    const text = stripMarker(raw);
    if (text) soft.push({ source: "user", text });
  }
  const style = input.style;
  if (style) {
    for (const [category, list] of Object.entries(style.rules)) {
      const label = CATEGORY_LABEL[category] ?? category;
      for (const item of list.do) {
        const reason = conflictWith(item, hard);
        if (reason) dropped.push({ text: `${label}: ${item}`, reason });
        else soft.push({ source: "style", text: `${label}, do: ${item}` });
      }
      for (const item of list.dont) soft.push({ source: "style", text: `${label}, don't: ${item}` });
    }
    for (const move of style.signatureMoves) {
      const text = `${move.label}: ${move.pattern}`;
      const reason = conflictWith(`${move.label} ${move.pattern} ${move.useWhen}`, hard);
      if (reason) dropped.push({ text, reason });
      else soft.push({ source: "style", text: `${text} (use when ${move.useWhen})` });
    }
  }
  return { hard, targets, soft, dropped, overrides, styled: style !== null };
}

const CHIP_ORDER: { rule: keyof HardRules; label: (r: HardRules) => string | null }[] = [
  { rule: "forbidEmoji", label: (r) => (r.forbidEmoji ? "No emoji" : null) },
  { rule: "forbidDashes", label: (r) => (r.forbidDashes ? "No dashes" : null) },
  { rule: "forbidHashtags", label: (r) => (r.forbidHashtags ? "No hashtags" : null) },
  { rule: "forbidPostscript", label: (r) => (r.forbidPostscript ? "No P.S." : null) },
  { rule: "maxBlockLines", label: (r) => (r.maxBlockLines !== null ? `${r.maxBlockLines} lines per block at most` : null) },
  { rule: "forbidRhetoricalOpening", label: (r) => (r.forbidRhetoricalOpening ? "No rhetorical opening" : null) },
  { rule: "forbidLinks", label: (r) => (r.forbidLinks ? "No links" : null) },
  { rule: "spelling", label: (r) => (r.spelling === "en-GB" ? "British spelling" : r.spelling === "en-US" ? "American spelling" : null) },
  { rule: "bannedPhrases", label: (r) => (r.bannedPhrases.length ? `${r.bannedPhrases.length} banned word${r.bannedPhrases.length === 1 ? "" : "s"}` : null) },
  { rule: "sourcesInPost", label: (r) => (r.sourcesInPost ? "Sources line" : null) },
];

/** What the Memories screen shows next to the writing rules: the rules enforced as checks, and how many only guide the writer. */
export function enforcedChips(userRulesMarkdown: string): { chips: string[]; guidance: number } {
  const { rules } = compileHardRules(userRulesMarkdown);
  const chips = CHIP_ORDER.flatMap((c) => {
    const label = c.label(rules);
    return label ? [label] : [];
  });
  const guidance = ruleLines(userRulesMarkdown).filter((l) => stripMarker(l) && rulesInLine(l).length === 0).length;
  return { chips, guidance };
}
