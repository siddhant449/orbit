import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { failingEmbedder, fakeEmbedder } from "@brandloop/ai/testing";
import { createKnowledge, hybridSearch, prisma } from "@brandloop/db";
import { indexKnowledge } from "./index-knowledge";
import { cleanupTestData, testProfile, WORDS_120 } from "./test-helpers";

beforeEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("indexKnowledge", () => {
  it("indexes a ready item so hybridSearch finds it", async () => {
    const p = await testProfile(20);
    const e = fakeEmbedder();
    const item = await createKnowledge(p, {
      type: "TEXT", title: "Hooks", content: "Quokkas are small marsupials. ".repeat(20) + WORDS_120,
    });
    const r = await indexKnowledge({ embedder: e }, item.id);
    expect(r.embedded).toBe(true);
    expect(r.chunks).toBeGreaterThan(0);
    const hits = await hybridSearch(p, "quokkas marsupials", { embedder: e });
    expect(hits[0]?.sourceId).toBe(item.id);
  });

  it("embeds title + chunk, so the title is searchable semantically", async () => {
    const p = await testProfile(21);
    const seen: string[] = [];
    const spy = { async embed(t: string[]) { seen.push(...t); return fakeEmbedder().embed(t); } };
    const item = await createKnowledge(p, { type: "TEXT", title: "Walrus handbook", content: WORDS_120 });
    await indexKnowledge({ embedder: spy }, item.id);
    expect(seen[0]!.startsWith("Walrus handbook\n\n")).toBe(true);
  });

  it("stores null embeddings and reports embedded:false when embed throws", async () => {
    const p = await testProfile(22);
    const item = await createKnowledge(p, { type: "TEXT", title: "T", content: WORDS_120 });
    const r = await indexKnowledge({ embedder: failingEmbedder() }, item.id);
    expect(r).toMatchObject({ embedded: false });
    expect(r.chunks).toBeGreaterThan(0);
  });

  it("works without an embedder (null)", async () => {
    const p = await testProfile(23);
    const item = await createKnowledge(p, { type: "TEXT", title: "T", content: WORDS_120 });
    expect(await indexKnowledge({ embedder: null }, item.id)).toMatchObject({ embedded: false });
  });

  it("removes chunks when the item has no content, and for a missing item", async () => {
    const p = await testProfile(24);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/a" });
    expect(await indexKnowledge({ embedder: null }, item.id)).toEqual({ chunks: 0, embedded: false });
    expect(await indexKnowledge({ embedder: null }, "missing")).toEqual({ chunks: 0, embedded: false });
  });
});
