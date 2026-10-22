/**
 * The final review's deterministic checks (design §6.3). Run by the server before the model review; their
 * results overwrite whatever the model reported, so a model can't wave a 3,001-character post through.
 */

export const CHECK_IDS = ["length", "hook-length", "hashtags", "banned-words", "placeholders", "markdown", "links", "emoji"] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export type CheckResult = { id: CheckId; passed: boolean; detail: string };

export const CHECK_LIMITS = { length: 3_000, hook: 200, hashtags: 3, links: 1, emoji: 5 } as const;

const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;
const PLACEHOLDER = /\[[^\]\n]{1,60}\]|\{[^}\n]{1,60}\}|\bTODO\b|\bXXX\b/g;
const MARKDOWN = /\*\*|__|^\s{0,3}#{1,6}\s|^\s*```|^\s*~~~/gm;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function bannedMatches(text: string, words: string[]): string[] {
  const hits: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    if (!word) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}_])`, "iu");
    if (re.test(text)) hits.push(word);
  }
  return hits;
}

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

const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.+?)\s*$/;

/** Bullets under any heading whose text contains "banned" (case-insensitive), up to the next heading. */
export function bannedWordsFromRules(markdown: string): string[] {
  const words: string[] = [];
  let inBanned = false;
  for (const line of markdown.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      inBanned = /banned/i.test(heading[1]!);
      continue;
    }
    if (!inBanned) continue;
    const bullet = BULLET.exec(line);
    if (!bullet) continue;
    const word = bullet[1]!.replace(/^["'`“‘]+|["'`”’]+$/g, "").trim();
    if (word && !words.includes(word)) words.push(word);
  }
  return words;
}
