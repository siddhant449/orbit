/**
 * OpenAI web-search leaves citation tokens in model text: "citeturn1view2", or just "citeturn1view2"
 * once the private-use delimiters are lost (several refs chain as "citeturn1view2turn3search0"). They are never part
 * of a post or a reply, so every place model text becomes document or chat text runs it through here. Real URLs stay.
 */
const PUA = "\\uE000-\\uF8FF";
const REF = "turn\\d+[a-z]+\\d+";
const MARKER = new RegExp(`[${PUA}]*(?:file)?cite(?:[${PUA}]*${REF})+[${PUA}]*`, "g");
const STRAY_BLOCK = new RegExp(`[${PUA}][^${PUA}\\n]{0,80}[${PUA}]`, "g");
const PUA_ONLY = new RegExp(`[${PUA}]`, "g");

export function stripCitations(text: string): string {
  if (!text) return text;
  return text
    .replace(MARKER, "")
    .replace(STRAY_BLOCK, (m) => (/(?:navlist|entity|cite)/.test(m) ? "" : m))
    .replace(PUA_ONLY, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}
