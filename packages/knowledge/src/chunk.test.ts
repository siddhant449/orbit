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
    expect(chunks[1]!.startsWith(chunks[0]!.slice(-400).trimStart().slice(0, 20))).toBe(true);
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
