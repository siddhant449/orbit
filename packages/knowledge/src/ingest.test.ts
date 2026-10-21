import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { failingEmbedder, fakeEmbedder } from "@brandloop/ai/testing";
import { createKnowledge, deleteKnowledge, getKnowledgeItem, hybridSearch, prisma, replaceChunks } from "@brandloop/db";
import type { AiClient } from "@brandloop/ai";
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
    expect(after?.error).toBe("Reading images isn't available right now");
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

  it("stores a generic message for unexpected errors and only IngestError text otherwise", async () => {
    const p = await testProfile(10);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/post" });
    const boom = (async () => {
      throw new Error("ECONNRESET at 10.1.2.3:5432 password=hunter2");
    }) as typeof fetch;
    // network errors are mapped to a readable message by the extractor
    await ingestKnowledge({ ai: fakeAi(), embedder: null, store: memoryStore(), fetch: boom }, item.id);
    expect((await getKnowledgeItem(item.id))?.error).toBe("Couldn't read that page");

    const item2 = await createKnowledge(p, { type: "TEXT", title: "T", content: WORDS_120 });
    const exploding: AiClient = {
      async json() { throw new Error("x"); },
      async text() { throw new Error("secret sk-123 internal detail"); },
    };
    await ingestKnowledge({ ai: exploding, embedder: null, store: memoryStore() }, item2.id);
    const after = await getKnowledgeItem(item2.id);
    // a summary failure no longer fails the item
    expect(after?.status).toBe("READY");
    expect(after?.error).toBeNull();
  });

  it("an unexpected error is stored as a generic message, never its text", async () => {
    const p = await testProfile(11);
    const store = memoryStore();
    const key = await store.put(Buffer.from("png"), "image/png");
    const item = await createKnowledge(p, { type: "IMAGE", title: "i", fileKey: key, mimeType: "image/png", sizeBytes: 3 });
    const leaky: AiClient = {
      async json() { throw new Error("x"); },
      async text() { throw new Error("secret sk-123 at /srv/internal"); },
    };
    await ingestKnowledge({ ai: leaky, embedder: null, store }, item.id);
    expect(await getKnowledgeItem(item.id)).toMatchObject({ status: "FAILED", error: "Something went wrong reading this item." });
  });

  it("keeps an existing summary when re-summarising fails, completes READY and re-indexes", async () => {
    const p = await testProfile(12);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    await ingestKnowledge({ ai: fakeAi("Old summary."), embedder: null, store: memoryStore() }, item.id);
    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { content: "zebra ".repeat(150) } });
    const failing: AiClient = {
      async json() { throw new Error("x"); },
      async text() { throw new Error("model down"); },
    };
    await ingestKnowledge({ ai: failing, embedder: null, store: memoryStore() }, item.id);
    const after = await getKnowledgeItem(item.id);
    expect(after).toMatchObject({ status: "READY", summary: "Old summary." });
    expect((await hybridSearch(p, "zebra", { embedder: null }))[0]?.sourceId).toBe(item.id);
    expect((await hybridSearch(p, "word5", { embedder: null }))).toHaveLength(0);
  });

  it("deletes the item's chunks when re-ingest extraction fails", async () => {
    const p = await testProfile(13);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/gone" });
    await replaceChunks(p, "KNOWLEDGE", item.id, [{ ordinal: 0, title: "t", text: "stale text", embedding: null }]);
    await ingestKnowledge({ ai: fakeAi(), embedder: null, store: memoryStore(), fetch: notFound }, item.id);
    expect((await getKnowledgeItem(item.id))?.status).toBe("FAILED");
    expect(await chunkCount(item.id)).toBe(0);
  });

  it("an ingest finishing after the item was deleted does not recreate chunks", async () => {
    const p = await testProfile(14);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: AiClient = {
      async json() { throw new Error("x"); },
      async text() { await gate; return "late summary"; },
    };
    const running = ingestKnowledge({ ai: slow, embedder: fakeEmbedder(), store: memoryStore() }, item.id);
    await new Promise((r) => setTimeout(r, 50));
    await deleteKnowledge(p, item.id);
    release();
    await running;
    expect(await chunkCount(item.id)).toBe(0);
    expect(await getKnowledgeItem(item.id)).toBeNull();
  });

  it("a stale job (content changed while it ran) neither overwrites content nor writes chunks", async () => {
    const p = await testProfile(15);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: WORDS_120 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: AiClient = {
      async json() { throw new Error("x"); },
      async text() { await gate; return "stale summary"; },
    };
    const running = ingestKnowledge({ ai: slow, embedder: null, store: memoryStore() }, item.id);
    await new Promise((r) => setTimeout(r, 50));
    const newer = "quokka ".repeat(150);
    await prisma.knowledgeItem.update({ where: { id: item.id }, data: { content: newer } });
    release();
    await running;
    const after = await getKnowledgeItem(item.id);
    expect(after?.content).toBe(newer);
    expect(after?.summary).toBeNull();
    expect(await chunkCount(item.id)).toBe(0); // the newer job (not run here) owns indexing
  });
});
