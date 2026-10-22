import { describe, expect, it } from "vitest";
import { measurePost } from "./measure";
import { renderBlocks, type WriterBlock } from "./render";

const opts = { bullet: "-" as const, numbered: true };

describe("renderBlocks", () => {
  it("renders list items adjacent and blocks blank-separated", () => {
    expect(renderBlocks([{ kind: "hook", lines: ["Hook."] }, { kind: "bullets", lines: ["a", "b"] }], opts)).toBe("Hook.\n\n- a\n- b");
  });

  it("numbers numbered blocks, uses the style's bullet glyph and never doubles a marker", () => {
    const blocks: WriterBlock[] = [
      { kind: "hook", lines: ["Three steps."] },
      { kind: "numbered", lines: ["First", "2. Second", "Third"] },
      { kind: "bullets", lines: ["• kept", "- also kept"] },
    ];
    expect(renderBlocks(blocks, { bullet: "•", numbered: true })).toBe("Three steps.\n\n1. First\n2. Second\n3. Third\n\n• kept\n• also kept");
    expect(renderBlocks([{ kind: "numbered", lines: ["a", "b"] }], { bullet: "-", numbered: false })).toBe("- a\n- b");
  });

  it("keeps a colon lead-in unmarked and adjacent to its list", () => {
    const text = renderBlocks([{ kind: "hook", lines: ["H."] }, { kind: "bullets", lines: ["Two answers:", "first", "second"] }], opts);
    expect(text).toBe("H.\n\nTwo answers:\n- first\n- second");
    expect(measurePost(text).bulletLists).toBe(1);
    expect(renderBlocks([{ kind: "numbered", lines: ["Steps:", "a", "b"] }], opts)).toBe("Steps:\n1. a\n2. b");
  });

  it("joins the lines of a prose block, drops empty blocks and lines, and trims", () => {
    const blocks: WriterBlock[] = [
      { kind: "hook", lines: [" Hook line "] },
      { kind: "prose", lines: ["One.", "", "Two."] },
      { kind: "prose", lines: [] },
      { kind: "close", lines: ["End."] },
      { kind: "sources", lines: ["Sources: A (21 Oct)"] },
    ];
    expect(renderBlocks(blocks, opts)).toBe("Hook line\n\nOne.\nTwo.\n\nEnd.\n\nSources: A (21 Oct)");
  });

  it("makes lists the validator sees as lists with no blank line between items", () => {
    const text = renderBlocks([{ kind: "hook", lines: ["H."] }, { kind: "bullets", lines: ["x", "y", "z"] }], opts);
    expect(measurePost(text).bulletLists).toBe(1);
    expect(text).not.toMatch(/- x\n\n- y/);
  });
});
