import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { failingEmbedder, fakeEmbedder } from "@brandloop/ai/testing";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { deleteChunks, hybridSearch, replaceChunks } from "./retrieval";

async function cleanup() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function profile(n: number) {
  const acc = await ensureAccount({
    clerkId: `user_test_retr${n}`,
    email: `retr${n}@example.test`,
    firstName: "Retr",
    teamNameSuffix: " (test)",
  });
  return acc.currentProfile!.id;
}
const count = (sourceId: string) => prisma.knowledgeChunk.count({ where: { sourceId } });

describe("schema", () => {
  it("has the pgvector extension and both indexes", async () => {
    const ext = await prisma.$queryRaw<{ extname: string }[]>`select extname from pg_extension where extname = 'vector'`;
    expect(ext).toHaveLength(1);
    const idx = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`select indexname, indexdef from pg_indexes where tablename = 'KnowledgeChunk'`;
    expect(idx.map((i) => i.indexname)).toEqual(
      expect.arrayContaining(["KnowledgeChunk_embedding_hnsw", "KnowledgeChunk_tsv_gin"]),
    );
    expect(idx.find((i) => i.indexname === "KnowledgeChunk_embedding_hnsw")?.indexdef).toMatch(/hnsw/);
    expect(idx.find((i) => i.indexname === "KnowledgeChunk_tsv_gin")?.indexdef).toMatch(/gin/);
  });
});

describe("hybridSearch", () => {
  it("finds a keyword match through full-text search when embeddings are null", async () => {
    const p = await profile(1);
    await replaceChunks(p, "KNOWLEDGE", "k1", [
      { ordinal: 0, title: "MVP vs POC", text: "A proof of concept tests feasibility.", embedding: null },
    ]);
    const hits = await hybridSearch(p, "proof of concept", { embedder: null });
    expect(hits[0]?.sourceId).toBe("k1");
  });

  it("finds a vector-only match with no lexical overlap", async () => {
    const p = await profile(2);
    const e = fakeEmbedder();
    const [v] = await e.embed(["zebra migration"]);
    await replaceChunks(p, "KNOWLEDGE", "k2", [{ ordinal: 0, title: "Notes", text: "lorem ipsum", embedding: v! }]);
    expect((await hybridSearch(p, "zebra migration", { embedder: e }))[0]?.sourceId).toBe("k2");
  });

  it("ranks a chunk found by both lists above one found by one list", async () => {
    const p = await profile(3);
    const e = fakeEmbedder();
    const [both, vOnly] = await e.embed(["zebra migration", "zebra migration herd"]);
    await replaceChunks(p, "KNOWLEDGE", "vec-only", [{ ordinal: 0, title: "A", text: "unrelated words here", embedding: vOnly! }]);
    await replaceChunks(p, "KNOWLEDGE", "both", [{ ordinal: 0, title: "B", text: "zebra migration", embedding: both! }]);
    const hits = await hybridSearch(p, "zebra migration", { embedder: e });
    expect(hits.map((h) => h.sourceId)).toEqual(["both", "vec-only"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("falls back to full-text search when the embedder throws", async () => {
    const p = await profile(4);
    await replaceChunks(p, "KNOWLEDGE", "k1", [
      { ordinal: 0, title: "MVP", text: "A proof of concept tests feasibility.", embedding: null },
    ]);
    const hits = await hybridSearch(p, "proof of concept", { embedder: failingEmbedder() });
    expect(hits[0]?.sourceId).toBe("k1");
  });

  it("never returns another profile's chunks", async () => {
    const a = await profile(5);
    const b = await profile(6);
    const chunk = { ordinal: 0, title: "T", text: "proof of concept", embedding: null };
    await replaceChunks(a, "KNOWLEDGE", "mine", [chunk]);
    await replaceChunks(b, "KNOWLEDGE", "theirs", [chunk]);
    const hits = await hybridSearch(a, "proof of concept", { embedder: null });
    expect(hits.map((h) => h.sourceId)).toEqual(["mine"]);
  });

  it("keeps at most 2 chunks per source and groups by source", async () => {
    const p = await profile(7);
    await replaceChunks(
      p,
      "KNOWLEDGE",
      "big",
      [0, 1, 2, 3].map((ordinal) => ({ ordinal, title: "T", text: `pricing strategy part ${ordinal}`, embedding: null })),
    );
    const hits = await hybridSearch(p, "pricing strategy", { embedder: null });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.chunks).toHaveLength(2);
  });
});

describe("replaceChunks / deleteChunks", () => {
  it("removes the source's previous chunks", async () => {
    const p = await profile(8);
    const mk = (n: number) => Array.from({ length: n }, (_, ordinal) => ({ ordinal, title: "T", text: "x", embedding: null }));
    expect(await replaceChunks(p, "KNOWLEDGE", "s", mk(3))).toBe(3);
    expect(await count("s")).toBe(3);
    await replaceChunks(p, "KNOWLEDGE", "s", mk(1));
    expect(await count("s")).toBe(1);
    await deleteChunks("KNOWLEDGE", "s");
    expect(await count("s")).toBe(0);
  });
});
