/** The writer returns blocks; the server renders the text (design §4.1). List items are always adjacent, blocks blank-separated. */
export type WriterBlock = { kind: "hook" | "prose" | "bullets" | "numbered" | "close" | "sources"; lines: string[] };

const MARKER = /^\s*(?:[-•*]|\d+[.)])\s+/;

export function renderBlocks(blocks: WriterBlock[], opts: { bullet: "-" | "•"; numbered: boolean }): string {
  return blocks
    .map((b) => {
      const all = b.lines.map((l) => l.trim()).filter(Boolean);
      if (b.kind !== "bullets" && b.kind !== "numbered") return all.join("\n");
      // A list may open with a lead-in line ending in a colon; it stays unmarked and adjacent to the items.
      const lead = all.length > 1 && all[0]!.endsWith(":") && !MARKER.test(all[0]!) ? [all[0]!] : [];
      const items = all.slice(lead.length);
      const marked =
        b.kind === "bullets"
          ? items.map((l) => `${opts.bullet} ${l.replace(MARKER, "")}`)
          : items.map((l, i) => `${opts.numbered ? `${i + 1}.` : opts.bullet} ${l.replace(MARKER, "")}`);
      return [...lead, ...marked].join("\n");
    })
    .filter((b) => b.trim() !== "")
    .join("\n\n");
}
