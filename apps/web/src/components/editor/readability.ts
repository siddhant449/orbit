/**
 * Readability as a Flesch-Kincaid grade level, computed locally from the text alone:
 * 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59, floored at 0 and rounded.
 * Syllables use a vowel-group heuristic (silent final e, "-ed" endings). Line breaks end sentences, because LinkedIn
 * posts rarely punctuate list lines. Texts under 10 words get no score: the formula isn't meaningful there.
 */
export const MIN_WORDS = 10;

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.match(/[aeiou]+|(?<=.)y+/g) ?? [];
  let n = groups.length;
  if (n > 1) {
    // Silent final "e" (make, change), unless it's "-le" after a consonant (table) or part of a vowel pair (revenue).
    if (w.endsWith("e") && !/[^aeiouy]le$/.test(w) && !/[aeiou]e$/.test(w)) n -= 1;
    // Silent "-ed" (noticed), but not after t or d (wanted, needed).
    else if (/[^aeioutdy]ed$/.test(w)) n -= 1;
  }
  return Math.max(n, 1);
}

export type Readability = { grade: number; words: number; sentences: number; syllables: number };

export function readability(text: string): Readability | null {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’%.,-]*/gu)?.map((w) => w.replace(/[.,]+$/, "")) ?? [];
  if (words.length < MIN_WORDS) return null;
  const sentences = text
    .split(/[.!?]+(?=\s|$)|\n+/)
    .filter((s) => /[\p{L}\p{N}]/u.test(s)).length;
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  const raw = 0.39 * (words.length / Math.max(sentences, 1)) + 11.8 * (syl / words.length) - 15.59;
  return { grade: Math.max(0, Math.round(raw)), words: words.length, sentences: Math.max(sentences, 1), syllables: syl };
}
