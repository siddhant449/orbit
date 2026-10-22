import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { deleteChat, getChat, getOrCreateChat } from "./chat";
import {
  createDocumentForChat,
  DocumentError,
  DocumentVersionConflict,
  getChatDocument,
  getDocument,
  linkChatToDocument,
  listDocuments,
  listDocumentVersions,
  restoreDocumentVersion,
  saveDocumentVersion,
} from "./documents";

const clerk = (n: number) => ({
  clerkId: `user_test_docs${n}`,
  email: `docs${n}@example.test`,
  firstName: `Docs${n}`,
  teamNameSuffix: " (test)",
});

async function cleanup() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}

let p: string;
let chat: string;

beforeEach(async () => {
  await cleanup();
  const s = await ensureAccount(clerk(1));
  p = s.currentProfile!.id;
  chat = randomUUID();
  await getOrCreateChat(p, s.user.id, chat);
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("documents", () => {
  it("creates v1, links the chat, and refuses a second post in the same chat", async () => {
    const d = await createDocumentForChat(p, chat, { title: "  MVP versus POC ", text: "Body", hook: "Hook" });
    expect(d).toMatchObject({ title: "MVP versus POC", kind: "TEXT", status: "DRAFT", version: 1, text: "Body", hook: "Hook", chatId: chat });
    expect((await getChat(p, chat))!.documentId).toBe(d.id);
    expect(await getChatDocument(p, chat)).toMatchObject({ id: d.id, version: 1 });
    const versions = await listDocumentVersions(p, d.id);
    expect(versions).toMatchObject([{ version: 1, source: "AI_CREATE", chars: 4 }]);
    await expect(createDocumentForChat(p, chat, { title: "x", text: "y" })).rejects.toMatchObject({ code: "EXISTING_POST" });
    expect(await prisma.document.count({ where: { profileId: p } })).toBe(1);
  });

  it("creates exactly one post when two creates race on the same chat", async () => {
    const results = await Promise.allSettled([
      createDocumentForChat(p, chat, { title: "A", text: "a" }),
      createDocumentForChat(p, chat, { title: "B", text: "b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "EXISTING_POST" });
    expect(await prisma.document.count({ where: { profileId: p } })).toBe(1);
  });

  it("saves a new version and bumps the counter", async () => {
    const d = await createDocumentForChat(p, chat, { title: "T", text: "v1" });
    const v2 = await saveDocumentVersion(p, d.id, { text: "v2", title: "T2", source: "USER_EDIT", changeSummary: "edit", expectedVersion: 1 });
    expect(v2).toMatchObject({ version: 2, text: "v2", title: "T2" });
    expect((await getDocument(p, d.id))!.text).toBe("v2");
    expect((await listDocumentVersions(p, d.id)).map((v) => [v.version, v.source])).toEqual([
      [2, "USER_EDIT"],
      [1, "AI_CREATE"],
    ]);
  });

  it("rejects a stale expectedVersion and keeps the newer text", async () => {
    const d = await createDocumentForChat(p, chat, { title: "T", text: "v1" });
    await saveDocumentVersion(p, d.id, { text: "user v2", source: "USER_EDIT", expectedVersion: 1 });
    const err = await saveDocumentVersion(p, d.id, { text: "ai v2", source: "AI_EDIT", expectedVersion: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(DocumentVersionConflict);
    expect(err.currentVersion).toBe(2);
    expect((await getDocument(p, d.id))!.text).toBe("user v2");
  });

  it("lets exactly one of two concurrent saves at the same version win", async () => {
    const d = await createDocumentForChat(p, chat, { title: "T", text: "v1" });
    const results = await Promise.allSettled([
      saveDocumentVersion(p, d.id, { text: "a", source: "USER_EDIT", expectedVersion: 1 }),
      saveDocumentVersion(p, d.id, { text: "b", source: "AI_EDIT", expectedVersion: 1 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(DocumentVersionConflict);
    expect((await listDocumentVersions(p, d.id)).length).toBe(2);
  });

  it("records a proposal id once per document and lists it", async () => {
    const d = await createDocumentForChat(p, chat, { title: "T", text: "v1" });
    await saveDocumentVersion(p, d.id, { text: "v2", source: "PROPOSAL", proposalId: "call_p", expectedVersion: 1 });
    expect((await listDocumentVersions(p, d.id))[0]).toMatchObject({ version: 2, proposalId: "call_p" });
    expect((await listDocumentVersions(p, d.id))[1]).toMatchObject({ version: 1, proposalId: null });
    const again = saveDocumentVersion(p, d.id, { text: "v3", source: "PROPOSAL", proposalId: "call_p", expectedVersion: 2 });
    await expect(again).rejects.toBeInstanceOf(DocumentError);
    await expect(again).rejects.toMatchObject({ code: "already_applied" });
    expect((await getDocument(p, d.id))!.version).toBe(2);
  });

  it("restore writes a new RESTORE version with the old text", async () => {
    const d = await createDocumentForChat(p, chat, { title: "T", text: "v1", hook: "h1" });
    await saveDocumentVersion(p, d.id, { text: "v2", hook: "h2", source: "USER_EDIT", expectedVersion: 1 });
    const r = await restoreDocumentVersion(p, d.id, 1, 2);
    expect(r).toMatchObject({ version: 3, text: "v1", hook: "h1" });
    const versions = await listDocumentVersions(p, d.id);
    expect(versions[0]).toMatchObject({ version: 3, source: "RESTORE", changeSummary: "Restored version 1" });
    await expect(restoreDocumentVersion(p, d.id, 1, 2)).rejects.toBeInstanceOf(DocumentVersionConflict);
    await expect(restoreDocumentVersion(p, d.id, 9, 3)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a 121-char title and hides other profiles' documents", async () => {
    await expect(createDocumentForChat(p, chat, { title: "x".repeat(121), text: "y" })).rejects.toMatchObject({ code: "invalid" });
    await expect(createDocumentForChat(p, chat, { title: "   ", text: "y" })).rejects.toBeInstanceOf(DocumentError);
    await expect(createDocumentForChat(p, chat, { title: "t", text: "" })).rejects.toMatchObject({ code: "invalid" });
    await expect(createDocumentForChat(p, chat, { title: "t", text: "y".repeat(10_001) })).rejects.toMatchObject({ code: "invalid" });
    const d = await createDocumentForChat(p, chat, { title: "x".repeat(120), text: "y".repeat(10_000) });
    await expect(saveDocumentVersion(p, d.id, { text: "", source: "USER_EDIT", expectedVersion: 1 })).rejects.toMatchObject({ code: "invalid" });

    const other = await ensureAccount(clerk(2));
    const q = other.currentProfile!.id;
    expect(await getDocument(q, d.id)).toBeNull();
    expect(await getChatDocument(q, chat)).toBeNull();
    await expect(listDocumentVersions(q, d.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(saveDocumentVersion(q, d.id, { text: "steal", source: "USER_EDIT", expectedVersion: 1 })).rejects.toMatchObject({ code: "not_found" });
    await expect(restoreDocumentVersion(q, d.id, 1, 1)).rejects.toMatchObject({ code: "not_found" });
    // Another profile can't attach a post to this chat either.
    await expect(createDocumentForChat(q, chat, { title: "t", text: "y" })).rejects.toMatchObject({ code: "not_found" });
    expect((await getDocument(p, d.id))!.version).toBe(1);
  });

  it("lists the profile's posts newest first with their current text", async () => {
    const a = await createDocumentForChat(p, chat, { title: "First", text: "one" });
    const s = await ensureAccount(clerk(1));
    const chat2 = randomUUID();
    await getOrCreateChat(p, s.user.id, chat2);
    const b = await createDocumentForChat(p, chat2, { title: "Second", text: "two" });
    await saveDocumentVersion(p, a.id, { text: "one, edited", source: "USER_EDIT", expectedVersion: 1 });
    const rows = await listDocuments(p);
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(rows[0]).toMatchObject({ title: "First", version: 2, text: "one, edited", status: "DRAFT", chatId: chat });
    const other = await ensureAccount(clerk(2));
    expect(await listDocuments(other.currentProfile!.id)).toEqual([]);
  });

  describe("linkChatToDocument", () => {
    it("returns the post's live chat when it has one", async () => {
      const d = await createDocumentForChat(p, chat, { title: "T", text: "x" });
      const s = await ensureAccount(clerk(1));
      expect(await linkChatToDocument(p, s.user.id, randomUUID(), d.id)).toEqual({ chatId: chat, created: false });
    });

    it("gives a post whose chat was deleted a new chat, titled after the post", async () => {
      const d = await createDocumentForChat(p, chat, { title: "Free tier", text: "x" });
      await deleteChat(p, chat);
      expect((await getDocument(p, d.id))!.chatId).toBeNull();
      const s = await ensureAccount(clerk(1));
      const fresh = randomUUID();
      expect(await linkChatToDocument(p, s.user.id, fresh, d.id)).toEqual({ chatId: fresh, created: true });
      expect(await getChatDocument(p, fresh)).toMatchObject({ id: d.id });
      expect((await getChat(p, fresh))!.title).toBe("Free tier");
      expect((await getDocument(p, d.id))!.chatId).toBe(fresh);
      // Idempotent for the same id.
      expect(await linkChatToDocument(p, s.user.id, fresh, d.id)).toEqual({ chatId: fresh, created: false });
    });

    it("refuses another profile's post and a chat that already has a post", async () => {
      const d = await createDocumentForChat(p, chat, { title: "T", text: "x" });
      await deleteChat(p, chat);
      const other = await ensureAccount(clerk(2));
      await expect(linkChatToDocument(other.currentProfile!.id, other.user.id, randomUUID(), d.id)).rejects.toMatchObject({ code: "not_found" });

      const s = await ensureAccount(clerk(1));
      const busy = randomUUID();
      await getOrCreateChat(p, s.user.id, busy);
      await createDocumentForChat(p, busy, { title: "Other", text: "y" });
      await expect(linkChatToDocument(p, s.user.id, busy, d.id)).rejects.toMatchObject({ code: "EXISTING_POST" });
    });
  });
});
