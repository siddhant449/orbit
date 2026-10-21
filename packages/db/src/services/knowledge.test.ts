import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import {
  completeIngest, createKnowledge, deleteKnowledge, failIngest, getKnowledgeItem,
  KNOWLEDGE_PAGE_SIZE, KnowledgeNotFoundError, listKnowledge, updateKnowledge,
} from "./knowledge";
import { replaceChunks } from "./retrieval";

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
    clerkId: `user_test_kdb${n}`, email: `kdb${n}@example.test`, firstName: "K", teamNameSuffix: " (test)",
  });
  return acc.currentProfile!.id;
}
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("createKnowledge", () => {
  it("TEXT goes straight to READY with content", async () => {
    const p = await profile(1);
    const item = await createKnowledge(p, { type: "TEXT", title: "Notes", content: words(100) });
    expect(item).toMatchObject({ status: "READY", type: "TEXT" });
    expect(item.content).toBe(words(100));
  });

  it("rejects a text item with 99 words", async () => {
    const p = await profile(2);
    await expect(createKnowledge(p, { type: "TEXT", title: "Notes", content: words(99) })).rejects.toThrow(
      "Add at least 100 words",
    );
  });

  it("rejects text over 50,000 characters", async () => {
    const p = await profile(3);
    await expect(
      createKnowledge(p, { type: "TEXT", title: "Notes", content: "word ".repeat(10_001) }),
    ).rejects.toThrow(/50,000/);
  });

  it("rejects a 101-character title and accepts 100", async () => {
    const p = await profile(4);
    await expect(createKnowledge(p, { type: "TEXT", title: "t".repeat(101), content: words(100) })).rejects.toThrow(
      /100 characters/,
    );
    await expect(createKnowledge(p, { type: "TEXT", title: "t".repeat(100), content: words(100) })).resolves.toBeTruthy();
  });

  it("URL goes PROCESSING, defaults its title to the host, rejects non-http(s)", async () => {
    const p = await profile(5);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/a/b" });
    expect(item).toMatchObject({ status: "PROCESSING", title: "example.com" });
    await expect(createKnowledge(p, { type: "URL", sourceUrl: "ftp://example.com" })).rejects.toThrow(/http/);
  });

  it("stores the profile's team", async () => {
    const p = await profile(6);
    const prof = await prisma.profile.findUniqueOrThrow({ where: { id: p } });
    const item = await createKnowledge(p, { type: "TEXT", title: "N", content: words(100) });
    expect(item.teamId).toBe(prof.teamId);
  });
});

describe("listKnowledge", () => {
  it("returns 50 items with hasMore when 51 exist, then the last one", async () => {
    const p = await profile(7);
    const prof = await prisma.profile.findUniqueOrThrow({ where: { id: p } });
    await prisma.knowledgeItem.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        profileId: p, teamId: prof.teamId, title: `Item ${i}`, type: "TEXT" as const, status: "READY" as const,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })),
    });
    const first = await listKnowledge(p, { order: "desc", offset: 0 });
    expect(first.items).toHaveLength(KNOWLEDGE_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.items[0]!.title).toBe("Item 50");
    const second = await listKnowledge(p, { order: "desc", offset: 50 });
    expect(second.items.map((i) => i.title)).toEqual(["Item 0"]);
    expect(second.hasMore).toBe(false);
    expect((await listKnowledge(p, { order: "asc", offset: 0 })).items[0]!.title).toBe("Item 0");
  });

  it("filters by type, searches title with 3+ chars, ignores shorter q, scopes to profile", async () => {
    const p = await profile(8);
    const other = await profile(9);
    await createKnowledge(p, { type: "TEXT", title: "Pricing page teardown", content: words(100) });
    await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/x", title: "Hook library" });
    await createKnowledge(other, { type: "TEXT", title: "Pricing secrets", content: words(100) });
    expect((await listKnowledge(p, { order: "desc", offset: 0, type: "URL" })).items.map((i) => i.title)).toEqual([
      "Hook library",
    ]);
    expect((await listKnowledge(p, { order: "desc", offset: 0, q: "PRIC" })).items.map((i) => i.title)).toEqual([
      "Pricing page teardown",
    ]);
    expect((await listKnowledge(p, { order: "desc", offset: 0, q: "pr" })).items).toHaveLength(2);
  });
});

describe("ingest state", () => {
  it("completeIngest sets READY, content, summary and clears error; failIngest sets FAILED", async () => {
    const p = await profile(10);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/x" });
    await failIngest(item.id, "boom");
    expect(await getKnowledgeItem(item.id)).toMatchObject({ status: "FAILED", error: "boom" });
    await completeIngest(item.id, "body", "sum");
    expect(await getKnowledgeItem(item.id)).toMatchObject({
      status: "READY", content: "body", summary: "sum", error: null,
    });
  });
});

describe("updateKnowledge", () => {
  it("renames without flagging a reindex; content change flags it; same content does not", async () => {
    const p = await profile(11);
    const item = await createKnowledge(p, { type: "TEXT", title: "Old", content: words(100) });
    const r1 = await updateKnowledge(p, item.id, { title: "New" });
    expect(r1).toMatchObject({ contentChanged: false, item: { title: "New" } });
    const r2 = await updateKnowledge(p, item.id, { content: words(100) });
    expect(r2.contentChanged).toBe(false);
    const r3 = await updateKnowledge(p, item.id, { content: words(120) });
    expect(r3.contentChanged).toBe(true);
    expect(r3.item.content).toBe(words(120));
  });

  it("validates TEXT edits and title length, and scopes to the profile", async () => {
    const p = await profile(12);
    const other = await profile(13);
    const item = await createKnowledge(p, { type: "TEXT", title: "Old", content: words(100) });
    await expect(updateKnowledge(p, item.id, { content: words(5) })).rejects.toThrow("Add at least 100 words");
    await expect(updateKnowledge(p, item.id, { title: "x".repeat(101) })).rejects.toThrow(/100 characters/);
    await expect(updateKnowledge(other, item.id, { title: "Hijack" })).rejects.toThrow(/not found/i);
  });
});

describe("deleteKnowledge", () => {
  it("removes the item's chunks and its stored file", async () => {
    const p = await profile(14);
    const item = await createKnowledge(p, {
      type: "DOCUMENT", title: "a.txt", fileKey: "k1.txt", mimeType: "text/plain", sizeBytes: 5,
    });
    await replaceChunks(p, "KNOWLEDGE", item.id, [{ ordinal: 0, title: "a", text: "hello", embedding: null }]);
    expect(await prisma.knowledgeChunk.count({ where: { sourceId: item.id } })).toBe(1);
    const deleted: string[] = [];
    await deleteKnowledge(p, item.id, { async delete(key) { deleted.push(key); } });
    expect(await prisma.knowledgeChunk.count({ where: { sourceId: item.id } })).toBe(0);
    expect(await getKnowledgeItem(item.id)).toBeNull();
    expect(deleted).toEqual(["k1.txt"]);
  });

  it("will not delete another profile's item", async () => {
    const p = await profile(15);
    const other = await profile(16);
    const item = await createKnowledge(p, { type: "TEXT", title: "N", content: words(100) });
    await expect(deleteKnowledge(other, item.id)).rejects.toThrow(/not found/i);
    expect(await getKnowledgeItem(item.id)).not.toBeNull();
  });
});

describe("hardening", () => {
  it("throws a typed not-found error", async () => {
    const p = await profile(20);
    await expect(deleteKnowledge(p, "missing")).rejects.toBeInstanceOf(KnowledgeNotFoundError);
    await expect(updateKnowledge(p, "missing", { title: "x" })).rejects.toBeInstanceOf(KnowledgeNotFoundError);
  });

  it("completeIngest is compare-and-set on content; fails closed when it changed", async () => {
    const p = await profile(21);
    const item = await createKnowledge(p, { type: "TEXT", title: "T", content: words(100) });
    expect(await completeIngest(item.id, "x", "s", { content: "different" })).toBeNull();
    expect(await getKnowledgeItem(item.id)).toMatchObject({ content: words(100), summary: null });
    expect(await completeIngest(item.id, words(100), "s", { content: words(100) })).toMatchObject({ summary: "s" });
  });

  it("completeIngest with undefined summary leaves the existing summary", async () => {
    const p = await profile(22);
    const item = await createKnowledge(p, { type: "TEXT", title: "T", content: words(100) });
    await completeIngest(item.id, words(100), "keep me");
    await completeIngest(item.id, words(100), undefined);
    expect((await getKnowledgeItem(item.id))?.summary).toBe("keep me");
  });

  it("failIngest honours the same compare-and-set", async () => {
    const p = await profile(23);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/x" });
    expect(await failIngest(item.id, "boom", { content: "other" })).toBeNull();
    expect((await getKnowledgeItem(item.id))?.status).toBe("PROCESSING");
  });

  it("replaceChunks with a guard skips when the item is gone or its content changed", async () => {
    const p = await profile(24);
    const item = await createKnowledge(p, { type: "TEXT", title: "T", content: words(100) });
    const chunk = [{ ordinal: 0, title: "T", text: "hello", embedding: null }];
    expect(await replaceChunks(p, "KNOWLEDGE", item.id, chunk, { content: "stale" })).toBeNull();
    expect(await replaceChunks(p, "KNOWLEDGE", "gone", chunk, { content: "x" })).toBeNull();
    expect(await prisma.knowledgeChunk.count({ where: { sourceId: { in: [item.id, "gone"] } } })).toBe(0);
    expect(await replaceChunks(p, "KNOWLEDGE", item.id, chunk, { content: words(100) })).toBe(1);
  });

  it("deleteKnowledge removes item and chunks together", async () => {
    const p = await profile(25);
    const item = await createKnowledge(p, { type: "TEXT", title: "T", content: words(100) });
    await replaceChunks(p, "KNOWLEDGE", item.id, [{ ordinal: 0, title: "T", text: "hello", embedding: null }]);
    await deleteKnowledge(p, item.id);
    expect(await prisma.knowledgeChunk.count({ where: { sourceId: item.id } })).toBe(0);
    expect(await getKnowledgeItem(item.id)).toBeNull();
  });
});

describe("failIngest and chunks", () => {
  it("deletes the item's chunks in the same guarded step", async () => {
    const p = await profile(30);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/x" });
    await replaceChunks(p, "KNOWLEDGE", item.id, [{ ordinal: 0, title: "t", text: "stale", embedding: null }]);
    await failIngest(item.id, "boom");
    expect(await prisma.knowledgeChunk.count({ where: { sourceId: item.id } })).toBe(0);
  });

  it("keeps the chunks when the compare-and-set skips the failure", async () => {
    const p = await profile(31);
    const item = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/x" });
    await replaceChunks(p, "KNOWLEDGE", item.id, [{ ordinal: 0, title: "t", text: "fresh", embedding: null }]);
    expect(await failIngest(item.id, "boom", { content: "something else" })).toBeNull();
    expect(await prisma.knowledgeChunk.count({ where: { sourceId: item.id } })).toBe(1);
    expect((await getKnowledgeItem(item.id))?.status).toBe("PROCESSING");
  });
});
