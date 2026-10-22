/**
 * Post measurements: one module for everything that looks at a post's phone layout. The writer's validator, the side
 * panel's readout, the style compiler and the eval all use it, so they cannot disagree. Pure: no imports, safe in a
 * client bundle.
 */

/** Characters on one LinkedIn mobile line (Kleo's own `charactersPerLine`, WQ A1). Verify in a real feed before changing (D §9.1). */
export const CHARS_PER_MOBILE_LINE = 50;
/** Characters shown before "…see more" (about 3 mobile lines, WQ §8.9). Verify in a real feed before changing (D §9.1). */
export const LINKEDIN_FOLD_CHARS = 210;

export type EndingType = "question" | "rule" | "cta" | "statement" | "sources";
export type Range = { low: number; typical: number; high: number };

/** Layout targets of a style (D §2.1). Declared here for now; Task W3 moves the schema to packages/ai. */
export type LayoutTargets = {
  hookChars: Range;
  hookMobileLines: Range;
  postChars: Range;
  blocks: Range;
  /** Share (0-100) of prose blocks that take one, two or three-plus mobile lines. */
  blockLineMix: { one: number; two: number; threePlus: number };
  proseBlockChars: Range;
  sentenceWords: Range;
  /** Share (0-100) of posts that carry a bullet list / a numbered list. */
  listPosts: { bullet: number; numbered: number };
  emoji: { perPost: number; positions: ("line-end" | "cta" | "line-start")[] };
  hashtagsPerPost: number;
  postscriptPercent: number;
  linkPercent: number;
  /** Share (0-100) of posts per ending. */
  endings: Record<EndingType, number>;
};

export type Block = {
  lines: string[];
  /** "bullets" or "numbered" when the block holds a list (two or more adjacent items); otherwise "prose". */
  kind: "prose" | "bullets" | "numbered";
  mobileLines: number;
  chars: number;
};

export type PostMetrics = {
  words: number;
  chars: number;
  /** Non-empty lines. */
  lines: number;
  blocks: number;
  avgCharsPerLine: number;
  /** Most source lines in one block (WQ §6 "max lines in a block"). */
  maxBlockLines: number;
  maxBlockMobileLines: number;
  /** Blank lines over all lines, as in the WQ §6 table. */
  blankLineRatio: number;
  /** Share of blocks that hold a single source line (a paragraph is one line), as in the WQ §6 table. */
  oneLineBlockShare: number;
  hookChars: number;
  hookMobileLines: number;
  hookEndsBeforeFold: boolean;
  promiseBeforeFold: boolean;
  bulletLists: number;
  numberedLists: number;
  listItems: number;
  emoji: { count: number; positions: ("line-start" | "line-end" | "inline")[] };
  hashtags: number;
  dashes: number;
  postscript: boolean;
  links: number;
  numbers: string[];
  ending: EndingType;
  sentenceWords: { median: number; max: number };
};

const BULLET = /^\s*[-•*]\s+\S/;
const NUMBERED = /^\s*\d+[.)]\s+\S/;
const isBullet = (line: string) => BULLET.test(line);
const isNumbered = (line: string) => NUMBERED.test(line);
export const isListLine = (line: string) => BULLET.test(line) || NUMBERED.test(line);

/** Numerals, percentages and amounts as written ("40%", "$1,200"). List numbering ("1.") and "#1" are not numbers. */
export function extractNumbers(text: string): string[] {
  const body = text.split("\n").map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")).join("\n");
  return (body.match(NUMBER) ?? []).map((n) => n.trim());
}

/** Greedy word wrap at CHARS_PER_MOBILE_LINE; a word longer than a line is split by characters. */
export function mobileLines(line: string): number {
  const text = line.trim();
  if (!text) return 0;
  let rows = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    let w = [...word].length;
    if (used === 0) {
      // first word on the row
    } else if (used + 1 + w <= CHARS_PER_MOBILE_LINE) {
      used += 1 + w;
      continue;
    } else {
      rows += 1;
      used = 0;
    }
    while (w > CHARS_PER_MOBILE_LINE) {
      rows += 1;
      w -= CHARS_PER_MOBILE_LINE;
    }
    used = w;
  }
  return rows;
}

function listKind(lines: string[]): "bullets" | "numbered" | null {
  let kind: "bullets" | "numbered" | null = null;
  let run = 0;
  let runKind: "bullets" | "numbered" | null = null;
  for (const l of lines) {
    const k = isBullet(l) ? "bullets" : isNumbered(l) ? "numbered" : null;
    if (k && k === runKind) run += 1;
    else {
      runKind = k;
      run = k ? 1 : 0;
    }
    if (run >= 2 && !kind) kind = k;
  }
  return kind;
}

/** Blocks are separated by blank lines. A block holding two or more adjacent list items is a list block. */
export function splitBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((raw) => raw.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== ""))
    .filter((lines) => lines.length > 0)
    .map((lines) => ({
      lines,
      kind: listKind(lines) ?? "prose",
      mobileLines: lines.reduce((n, l) => n + mobileLines(l), 0),
      chars: lines.reduce((n, l) => n + l.length, 0),
    }));
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function graphemes(line: string): string[] {
  return segmenter ? [...segmenter.segment(line)].map((s) => s.segment) : [...line];
}

/** An emoji is a grapheme: a ZWJ family or a flag is one. Text-style symbols (©, ™, →) need a variation selector to count. */
function isEmoji(g: string): boolean {
  if (/\p{Regional_Indicator}/u.test(g) || /[0-9#*]️?⃣/u.test(g)) return true;
  if (!/\p{Extended_Pictographic}/u.test(g)) return false;
  return /\p{Emoji_Presentation}/u.test(g) || g.includes("️") || g.includes("‍");
}

function emojiOf(lines: string[]): PostMetrics["emoji"] {
  const positions: ("line-start" | "line-end" | "inline")[] = [];
  for (const line of lines) {
    const gs = graphemes(line.trim());
    const hits = gs.map((g, i) => (isEmoji(g) ? i : -1)).filter((i) => i >= 0);
    for (const i of hits) {
      const before = gs.slice(0, i).every((g) => /\s/.test(g) || isEmoji(g));
      const after = gs.slice(i + 1).every((g) => /\s/.test(g) || isEmoji(g));
      positions.push(before ? "line-start" : after ? "line-end" : "inline");
    }
  }
  return { count: positions.length, positions };
}

/** The text with every emoji removed (a grapheme is an emoji or it is not), and the spaces they leave tidied. */
export function stripEmoji(text: string): string {
  return text
    .split("\n")
    .map((line) => (graphemes(line).some(isEmoji) ? graphemes(line).filter((g) => !isEmoji(g)).join("").replace(/[ \t]{2,}/g, " ").trimEnd() : line))
    .join("\n");
}

/** Em dashes, en dashes that are not number ranges, and spaced hyphens. "co-founder" and "3–5" are not dashes. */
function countDashes(lines: string[]): number {
  let n = 0;
  for (const l of lines) {
    n += (l.match(/—/g) ?? []).length;
    n += (l.match(/(?<!\d)–|–(?!\d)/g) ?? []).length;
    n += (l.match(/(?<=\S) - (?=\S)/g) ?? []).length;
  }
  return n;
}

const HASHTAG = /(^|\s)#\p{L}[\p{L}\p{N}_]*/gu;
const LINK = /https?:\/\/\S+|\bwww\.\S+/gi;
const NUMBER = /(?<![\p{L}\d#])[$€£]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent\b|k\b|m\b|x\b|×))?/giu;
const CTA = /\b(comment|follow|dm me|repost|share this|subscribe|join|download|reply|book a|sign up|let me know|tell me|drop a|connect with|link in)\b/i;
const RULE = /\b(never|always|don't|do not|must|should|rule|stop|start|ship|pick|choose|use|build|ask|write|cut|keep)\b/i;

function classifyEnding(blocks: Block[]): EndingType {
  const last = blocks.at(-1);
  if (!last) return "statement";
  const text = last.lines.join(" ").trim();
  if (/^sources?\s*:/i.test(text)) return "sources";
  if (/\?\s*$/.test(text)) return "question";
  if (CTA.test(text)) return "cta";
  const lastSentence = text.split(/(?<=[.!])\s+/).at(-1) ?? text;
  if (lastSentence.length <= 140 && RULE.test(lastSentence)) return "rule";
  return "statement";
}

function sentenceLengths(lines: string[]): number[] {
  const out: number[] = [];
  for (const line of lines) {
    const body = line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "");
    for (const s of body.split(/(?<=[.!?])\s+/)) {
      const n = s.split(/\s+/).filter(Boolean).length;
      if (n > 0) out.push(n);
    }
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

export function measurePost(text: string): PostMetrics {
  const normal = text.replace(/\r\n?/g, "\n").trim();
  const blocks = splitBlocks(normal);
  const lines = blocks.flatMap((b) => b.lines);
  const allLines = normal === "" ? [] : normal.split("\n");
  const blank = allLines.filter((l) => l.trim() === "").length;
  const hook = blocks[0];
  const hookChars = hook ? hook.lines.join(" ").length : 0;
  const hookEndsBeforeFold = hookChars > 0 && hookChars <= LINKEDIN_FOLD_CHARS;
  const promiseBeforeFold = hookEndsBeforeFold && (blocks.length < 2 || hookChars + 2 < LINKEDIN_FOLD_CHARS);

  let bulletLists = 0;
  let numberedLists = 0;
  let listItems = 0;
  for (const b of blocks) {
    let kind: string | null = null;
    let run = 0;
    const close = () => {
      if (run >= 2) {
        listItems += run;
        if (kind === "b") bulletLists += 1;
        else numberedLists += 1;
      }
    };
    for (const l of b.lines) {
      const k = isBullet(l) ? "b" : isNumbered(l) ? "n" : null;
      if (k && k === kind) run += 1;
      else {
        close();
        kind = k;
        run = k ? 1 : 0;
      }
    }
    close();
  }

  const numbers = extractNumbers(lines.join("\n"));
  const sentences = sentenceLengths(lines);
  const last = blocks.at(-1);

  return {
    words: normal.split(/\s+/).filter(Boolean).length,
    chars: normal.length,
    lines: lines.length,
    blocks: blocks.length,
    avgCharsPerLine: lines.length ? Math.round(lines.reduce((n, l) => n + l.length, 0) / lines.length) : 0,
    maxBlockLines: blocks.reduce((n, b) => Math.max(n, b.lines.length), 0),
    maxBlockMobileLines: blocks.reduce((n, b) => Math.max(n, b.mobileLines), 0),
    blankLineRatio: allLines.length ? blank / allLines.length : 0,
    oneLineBlockShare: blocks.length ? blocks.filter((b) => b.lines.length === 1).length / blocks.length : 0,
    hookChars,
    hookMobileLines: hook ? hook.mobileLines : 0,
    hookEndsBeforeFold,
    promiseBeforeFold,
    bulletLists,
    numberedLists,
    listItems,
    emoji: emojiOf(lines),
    hashtags: (normal.match(HASHTAG) ?? []).length,
    dashes: countDashes(lines),
    postscript: last ? /^P\.?\s?S\.?\s*[:.]?(\s|$)/i.test(last.lines[0] ?? "") : false,
    links: (normal.match(LINK) ?? []).length,
    numbers,
    ending: classifyEnding(blocks),
    sentenceWords: { median: median(sentences), max: sentences.length ? Math.max(...sentences) : 0 },
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function rangeOf(values: number[]): Range {
  const s = [...values].sort((a, b) => a - b);
  return { low: round1(percentile(s, 0.1)), typical: round1(percentile(s, 0.5)), high: round1(percentile(s, 0.9)) };
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** The layout a corpus of posts shows: p10 / median / p90 per number, shares as percentages (D §2.1). Computed in code, never by a model. */
export function measureCorpus(posts: string[]): LayoutTargets {
  const ms = posts.map(measurePost);
  const blocks = posts.flatMap((p) => splitBlocks(p));
  const prose = blocks.filter((b) => b.kind === "prose");
  const positions = ms.flatMap((m) => m.emoji.positions);
  const endings: Record<EndingType, number> = { question: 0, rule: 0, cta: 0, statement: 0, sources: 0 };
  for (const m of ms) endings[m.ending] += 1;
  const emojiPositions = new Set<"line-end" | "cta" | "line-start">();
  for (const p of positions) if (p !== "inline") emojiPositions.add(p);
  const sentences = posts.flatMap((p) => sentenceLengths(splitBlocks(p).flatMap((b) => b.lines)));
  return {
    hookChars: rangeOf(ms.map((m) => m.hookChars)),
    hookMobileLines: rangeOf(ms.map((m) => m.hookMobileLines)),
    postChars: rangeOf(ms.map((m) => m.chars)),
    blocks: rangeOf(ms.map((m) => m.blocks)),
    blockLineMix: {
      one: pct(prose.filter((b) => b.mobileLines === 1).length, prose.length),
      two: pct(prose.filter((b) => b.mobileLines === 2).length, prose.length),
      threePlus: pct(prose.filter((b) => b.mobileLines >= 3).length, prose.length),
    },
    proseBlockChars: rangeOf(prose.map((b) => b.chars)),
    sentenceWords: rangeOf(sentences),
    listPosts: {
      bullet: pct(ms.filter((m) => m.bulletLists > 0).length, ms.length),
      numbered: pct(ms.filter((m) => m.numberedLists > 0).length, ms.length),
    },
    emoji: { perPost: ms.length ? round1(ms.reduce((n, m) => n + m.emoji.count, 0) / ms.length) : 0, positions: [...emojiPositions] },
    hashtagsPerPost: ms.length ? round1(ms.reduce((n, m) => n + m.hashtags, 0) / ms.length) : 0,
    postscriptPercent: pct(ms.filter((m) => m.postscript).length, ms.length),
    linkPercent: pct(ms.filter((m) => m.links > 0).length, ms.length),
    endings: {
      question: pct(endings.question, ms.length),
      rule: pct(endings.rule, ms.length),
      cta: pct(endings.cta, ms.length),
      statement: pct(endings.statement, ms.length),
      sources: pct(endings.sources, ms.length),
    },
  };
}
