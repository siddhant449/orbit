import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { failingEmbedder, fakeEmbedder } from "@brandloop/ai/testing";
import { createKnowledge, getKnowledgeItem, hybridSearch, prisma } from "@brandloop/db";
import { ingestKnowledge } from "./ingest";
import { cleanupTestData, fakeAi, memoryStore, testProfile, unavailableAi, WORDS_120 } from "./test-helpers";

beforeEach(cleanupTestData);
afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

const html = readFileSync(new URL("../test/fixtures/article.html", import.meta.url)).toString();
const okFetch = (async () => new Response(html, { headers: { "content-type": "text/html" } })) as typeof fetch;
const notFound = (async () => new Response("nope", { status: 404 })) as typeof fetch;
const chunkCount = (id: string) => prisma.knowledgeChunk.count({ where: { sourceId: id } });

describe("ingestKnowledge", () => {
  it("summarises and indexes a TEXT item (already READY)", async () => {
    const p = await testProfile(1);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    expect(item.status).toBe("READY");
    await ingestKnowledge({ ai: fakeAi("Sum."), embedder: fakeEmbedder(), store: memoryStore() }, item.id);
    const after = await getKnowledgeItem(item.id);
    expect(after).toMatchObject({ status: "READY", summary: "Sum." });
    expect(await chunkCount(item.id)).toBeGreaterThan(0);
  });

  it("an unavailable AI still gives READY with a null summary", async () => {
    const p = await testProfile(2);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    await ingestKnowledge({ ai: unavailableAi, embedder: fakeEmbedder(), store: memoryStore() }, item.id);
    expect(await getKnowledgeItem(item.id)).toMatchObject({ status: "READY", summary: null });
    expect(await chunkCount(item.id)).toBeGreaterThan(0);
  });

  it("extracts a URL item, then READY with content", async () => {
    const p = await testProfile(3);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/post" });
    expect(item.status).toBe("PROCESSING");
    await ingestKnowledge({ ai: fakeAi(), embedder: null, store: memoryStore(), fetch: okFetch }, item.id);
    const after = await getKnowledgeItem(item.id);
    expect(after?.status).toBe("READY");
    expect(after?.content).toContain("The article fixture sentence lives here.");
  });

  it("a 404 URL ends FAILED with \"Couldn't read that page\", not stuck PROCESSING", async () => {
    const p = await testProfile(4);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/gone" });
    await ingestKnowledge({ ai: fakeAi(), embedder: null, store: memoryStore(), fetch: notFound }, item.id);
    expect(await getKnowledgeItem(item.id)).toMatchObject({ status: "FAILED", error: "Couldn't read that page" });
    expect(await chunkCount(item.id)).toBe(0);
  });

  it("reads a DOCUMENT from the upload store", async () => {
    const p = await testProfile(5);
    const store = memoryStore();
    const key = await store.put(Buffer.from("Consistency beats intensity. ".repeat(10)), "text/plain");
    const item = await createKnowledge(p, {
      type: "DOCUMENT", title: "notes.txt", fileKey: key, mimeType: "text/plain", sizeBytes: 100,
    });
    await ingestKnowledge({ ai: fakeAi(), embedder: fakeEmbedder(), store }, item.id);
    const after = await getKnowledgeItem(item.id);
    expect(after?.status).toBe("READY");
    expect(after?.content).toContain("Consistency beats intensity");
  });

  it("VIDEO items fail with the placeholder message", async () => {
    const p = await testProfile(6);
    const item = await createKnowledge(p, { type: "VIDEO", title: "Clip", sourceUrl: "https://youtu.be/abc" });
    await ingestKnowledge({ ai: fakeAi(), embedder: null, store: memoryStore() }, item.id);
    expect(await getKnowledgeItem(item.id)).toMatchObject({
      status: "FAILED",
      error: "Video support arrives shortly",
    });
  });

  it("an IMAGE with no AI key fails readably", async () => {
    const p = await testProfile(7);
    const store = memoryStore();
    const key = await store.put(Buffer.from("png"), "image/png");
    const item = await createKnowledge(p, {
      type: "IMAGE", title: "pic.png", fileKey: key, mimeType: "image/png", sizeBytes: 3,
    });
    await ingestKnowledge({ ai: unavailableAi, embedder: null, store }, item.id);
    const after = await getKnowledgeItem(item.id);
    expect(after?.status).toBe("FAILED");
    expect(after?.error).toMatch(/AI is unavailable/);
  });

  it("still marks READY and stores null embeddings when the embedder fails", async () => {
    const p = await testProfile(8);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    await ingestKnowledge({ ai: fakeAi(), embedder: failingEmbedder(), store: memoryStore() }, item.id);
    expect((await getKnowledgeItem(item.id))?.status).toBe("READY");
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`select count(*) n from "KnowledgeChunk" where "sourceId" = ${item.id} and embedding is null`;
    expect(Number(row!.n)).toBeGreaterThan(0);
    // full-text search still finds it
    expect((await hybridSearch(p, "word5", { embedder: null }))[0]?.sourceId).toBe(item.id);
  });

  it("re-ingesting an edited item re-summarises from its stored content and replaces chunks", async () => {
    const p = await testProfile(9);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    const deps = { ai: fakeAi(), embedder: fakeEmbedder(), store: memoryStore() };
    await ingestKnowledge(deps, item.id);
    const first = await chunkCount(item.id);
    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { content: "zebra ".repeat(150) } });
    await ingestKnowledge(deps, item.id);
    expect(await chunkCount(item.id)).toBe(first);
    expect((await hybridSearch(p, "zebra", { embedder: null }))[0]?.sourceId).toBe(item.id);
  });

  it("does nothing for a missing item", async () => {
    await expect(
      ingestKnowledge({ ai: fakeAi(), embedder: null, store: memoryStore() }, "nope"),
    ).resolves.toBeUndefined();
  });
});
