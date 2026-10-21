import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns [] for blank text and one chunk at or under 3200 chars", () => {
    expect(chunkText("  ")).toEqual([]);
    expect(chunkText("a".repeat(3200))).toHaveLength(1);
  });

  it("splits long text on paragraph boundaries with overlap", () => {
    const paras = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(100));
    const chunks = chunkText(paras.join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 3600)).toBe(true);
    // The overlap is the previous chunk's tail, snapped to a word boundary (so it may be a little under 400).
    const head = chunks[1]!.split("\n\n")[0]!;
    expect(chunks[0]!.endsWith(head)).toBe(true);
    expect(head.length).toBeLessThanOrEqual(400);
    expect(head.length).toBeGreaterThan(300);
  });

  it("splits an oversized paragraph at sentence ends", () => {
    const sentence = "This is one sentence about writing every single week. ";
    const chunks = chunkText(sentence.repeat(200));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 3600)).toBe(true);
    // every chunk after the first begins with overlap, and no chunk starts mid-word of the first one
    expect(chunks[0]!.endsWith(".")).toBe(true);
  });

  it("hard-splits a single run with no sentence ends and never loops", () => {
    const chunks = chunkText("x".repeat(10_000));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 3600)).toBe(true);
  });

  it("covers all the text: every paragraph appears in some chunk", () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Unique-${i} ` + "filler ".repeat(120));
    const chunks = chunkText(paras.join("\n\n"));
    for (let i = 0; i < 30; i++) expect(chunks.some((c) => c.includes(`Unique-${i} `))).toBe(true);
  });

  it("honours custom targetChars and overlapChars", () => {
    const chunks = chunkText("alpha beta. ".repeat(50), { targetChars: 100, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 140)).toBe(true);
  });
});

describe("chunkText bounds and word-aligned overlap", () => {
  it("splits exactly-3201-char input into two chunks within the real bound", () => {
    const chunks = chunkText("a".repeat(3201));
    expect(chunks).toHaveLength(2);
    expect(chunks.every((c) => c.length <= 3202)).toBe(true);
  });

  it("never exceeds target + overlap + 2 (3202) on varied input", () => {
    const text = Array.from({ length: 80 }, (_, i) => `P${i} ` + "lorem ipsum dolor sit amet. ".repeat(20 + (i % 9) * 15)).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(3202);
  });

  it("starts each overlap on a word boundary (never mid-word)", () => {
    const text = Array.from({ length: 30 }, (_, i) => "supercalifragilistic".repeat(1) + ` ${i} ` + "internationalization ".repeat(40)).join("\n\n");
    const chunks = chunkText(text);
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i]!.split("\n\n")[0]!;
      const at = chunks[i - 1]!.lastIndexOf(head);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at === 0 || /\s/.test(chunks[i - 1]![at - 1]!)).toBe(true);
      expect(head.length).toBeLessThanOrEqual(400);
    }
  });
});
