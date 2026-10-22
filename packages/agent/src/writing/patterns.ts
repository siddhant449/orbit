/** Text patterns shared by the final review's checks (specialists/checks.ts) and the validator (writing/lint.ts). */

export const PLACEHOLDER = /\[[^\]\n]{1,60}\]|\{[^}\n]{1,60}\}|\bTODO\b|\bXXX\b/g;
export const MARKDOWN = /\*\*|__(?=[^\s_])[^\n]*?[^\s_]__|^\s{0,3}#{1,6}\s|^\s*```|^\s*~~~/gm;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function bannedMatches(text: string, words: string[]): string[] {
  const hits: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    if (!word) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}_])`, "iu");
    if (re.test(text)) hits.push(word);
  }
  return hits;
}


const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.+?)\s*$/;

/** Bullets (comma-separated lists split) under any heading containing "banned" (case-insensitive), up to the next heading. */
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
    for (const part of bullet[1]!.split(",")) {
      const word = part.trim().replace(/^["'`“‘]+|["'`”’]+$/g, "").trim();
      if (word && !words.includes(word)) words.push(word);
    }
  }
  return words;
}
