const PHRASES = [
  "i appreciate you",
  "i notice the input",
  "i notice that",
  "could you provide",
  "can you provide",
  "i would need",
  "i'd need",
  "as an ai",
  "i can't help",
  "i cannot help",
  "i can’t help",
  "i'm unable to",
];

/** True when text looks like a model meta-reply rather than real content. */
export function looksLikeRefusal(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (PHRASES.some((p) => t.includes(p))) return true;
  return t.endsWith("?");
}
