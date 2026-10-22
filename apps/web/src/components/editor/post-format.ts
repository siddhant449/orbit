/**
 * The post editor's text model. A LinkedIn post is plain text: paragraphs separated by a blank line, line breaks
 * inside them, lists as typed bullets. The editor holds it as Tiptap JSON with only `paragraph`, `text` and
 * `hardBreak`; these functions convert both ways without losing a character, so the stored text round-trips exactly.
 *
 * Mapping: the text split on "\n\n" gives the paragraphs (an extra newline becomes a leading hard break of the next
 * one), and each "\n" inside a paragraph is a hard break. Because a paragraph's inline size equals its text length and
 * a paragraph boundary costs 2 positions as it costs 2 characters, a document position is always offset + 1.
 */

export type PostNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: PostNode[];
};

export type PostDoc = { type: "doc"; content: PostNode[] };

const normalise = (text: string) => text.replace(/\r\n?/g, "\n");

function inline(chunk: string): PostNode[] {
  const out: PostNode[] = [];
  chunk.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ type: "hardBreak" });
    if (line) out.push({ type: "text", text: line });
  });
  return out;
}

export function textToDoc(text: string): PostDoc {
  return {
    type: "doc",
    content: normalise(text)
      .split("\n\n")
      .map((chunk) => {
        const content = inline(chunk);
        return content.length ? { type: "paragraph", content } : { type: "paragraph" };
      }),
  };
}

function inlineText(node: PostNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

/** A block as plain text lines. Lists that slipped in (paste) become typed bullets or numbers. */
function blockText(node: PostNode): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return (node.content ?? []).map(inlineText).join("");
    case "bulletList":
      return (node.content ?? []).map((item) => `• ${itemText(item)}`).join("\n");
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return (node.content ?? []).map((item, i) => `${start + i}. ${itemText(item)}`).join("\n");
    }
    default:
      return (node.content ?? []).map((c) => (isBlock(c) ? blockText(c) : inlineText(c))).join(isBlockList(node) ? "\n\n" : "");
  }
}

const BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock"]);
const isBlock = (n: PostNode) => BLOCKS.has(n.type);
const isBlockList = (n: PostNode) => (n.content ?? []).some(isBlock);
const itemText = (item: PostNode) => (item.content ?? []).map(blockText).join("\n");

export function docToText(doc: { content?: PostNode[] } | null | undefined): string {
  return (doc?.content ?? []).map(blockText).join("\n\n");
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The plain-text offset of a document position. */
export function posToOffset(text: string, pos: number): number {
  return clamp(pos - 1, 0, normalise(text).length);
}

/** The document position of a plain-text offset. */
export function offsetToPos(text: string, offset: number): number {
  return clamp(offset, 0, normalise(text).length) + 1;
}

export type ListKind = "bullet" | "number";
const BULLET = /^• /;
const NUMBER = /^\d+\. /;
const prefixOf = (line: string) => BULLET.exec(line)?.[0] ?? NUMBER.exec(line)?.[0] ?? "";

/**
 * Toggles typed bullets ("• ") or numbers ("1. ") on every non-blank line the selection touches. If all of them
 * already carry that kind, it is removed; otherwise every line gets it (replacing the other kind). The selection is
 * moved with the text.
 */
export function toggleLinePrefix(text: string, from: number, to: number, kind: ListKind): { text: string; from: number; to: number } {
  const t = normalise(text);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const lines = t.split("\n");
  let start = 0;
  const touched: number[] = [];
  lines.forEach((line, i) => {
    const end = start + line.length;
    if (end >= lo && start <= hi && line.trim()) touched.push(i);
    start = end + 1;
  });
  if (!touched.length) return { text: t, from, to };
  const has = kind === "bullet" ? BULLET : NUMBER;
  const removing = touched.every((i) => has.test(lines[i]!));

  let shiftFrom = 0;
  let shiftTo = 0;
  let pos = 0;
  let n = 0;
  const out = lines.map((line, i) => {
    const lineStart = pos;
    pos += line.length + 1;
    if (!touched.includes(i)) return line;
    const old = prefixOf(line);
    const next = removing ? "" : kind === "bullet" ? "• " : `${++n}. `;
    const delta = next.length - old.length;
    // A caret inside the old prefix lands after the new one.
    if (lineStart <= lo) shiftFrom += lo - lineStart < old.length ? lineStart + next.length - lo : delta;
    if (lineStart <= hi) shiftTo += hi - lineStart < old.length ? lineStart + next.length - hi : delta;
    return next + line.slice(old.length);
  });
  const result = out.join("\n");
  return { text: result, from: clamp(lo + shiftFrom, 0, result.length), to: clamp(hi + shiftTo, 0, result.length) };
}
