import { assertTestDatabase } from "../test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import {
  claimRun,
  deleteChat,
  getChat,
  getOrCreateChat,
  isStopRequested,
  lastAssistantContext,
  listChats,
  listMessages,
  releaseRun,
  renameChat,
  requestStop,
  saveAssistantMessage,
  saveUserMessage,
  setChatPinned,
  setTitleIfDefault,
} from "./chat";

const clerk = (n: number) => ({
  clerkId: `user_test_chat${n}`,
  email: `chat${n}@example.test`,
  firstName: `Chat${n}`,
  teamNameSuffix: " (test)",
});

async function cleanup() {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function setup() {
  const s = await ensureAccount(clerk(1));
  const p = s.currentProfile!.id;
  const u = s.user.id;
  const c = randomUUID();
  await getOrCreateChat(p, u, c);
  return { p, u, c };
}
const msg = (id = randomUUID()) => ({ id, parts: [{ type: "text", text: "hi" }], metadata: { a: 1 }, context: { b: 2 } });

describe("getOrCreateChat", () => {
  it("creates once and then returns the same chat", async () => {
    const { p, u } = await setup();
    const id = randomUUID();
    expect((await getOrCreateChat(p, u, id)).created).toBe(true);
    const again = await getOrCreateChat(p, u, id);
    expect(again.created).toBe(false);
    expect(again.chat.title).toBe("New chat");
  });

  it("creates exactly once under parallel calls", async () => {
    const { p, u } = await setup();
    const id = randomUUID();
    const r = await Promise.all(Array.from({ length: 8 }, () => getOrCreateChat(p, u, id)));
    expect(r.filter((x) => x.created)).toHaveLength(1);
    expect(await prisma.chat.count({ where: { id } })).toBe(1);
  });

  it("refuses a chat id owned by another profile", async () => {
    const { c } = await setup();
    const other = await ensureAccount(clerk(2));
    await expect(getOrCreateChat(other.currentProfile!.id, other.user.id, c)).rejects.toMatchObject({ code: "chat_not_found" });
    expect(await getChat(other.currentProfile!.id, c)).toBeNull();
  });

  it("refuses a deleted chat id", async () => {
    const { p, u, c } = await setup();
    await deleteChat(p, c);
    await expect(getOrCreateChat(p, u, c)).rejects.toMatchObject({ code: "chat_not_found" });
  });
});

describe("run lock", () => {
  it("rejects a second claim with the active turn", async () => {
    const { c } = await setup();
    await claimRun(c, "run-1", "m1");
    await expect(claimRun(c, "run-2", "m2")).rejects.toMatchObject({
      code: "chat_turn_active",
      activeTurn: { runId: "run-1", requestMessageId: "m1" },
    });
  });

  it("lets a claim through when the lock is older than 6 minutes", async () => {
    const { c } = await setup();
    await claimRun(c, "run-1", "m1", new Date(Date.now() - 7 * 60_000));
    await expect(claimRun(c, "run-2", "m2")).resolves.toBeUndefined();
    expect((await prisma.chat.findUnique({ where: { id: c } }))?.activeRunId).toBe("run-2");
  });

  it("keeps the lock when the lock is 5 minutes old", async () => {
    const { c } = await setup();
    await claimRun(c, "run-1", "m1", new Date(Date.now() - 5 * 60_000));
    await expect(claimRun(c, "run-2", "m2")).rejects.toMatchObject({ code: "chat_turn_active" });
  });

  it("releaseRun with another runId keeps the lock", async () => {
    const { c } = await setup();
    await claimRun(c, "run-1", "m1");
    await releaseRun(c, "run-2");
    await expect(claimRun(c, "run-3", "m3")).rejects.toMatchObject({ code: "chat_turn_active" });
  });

  it("releaseRun with the owner frees the lock and clears the stop flag", async () => {
    const { p, c } = await setup();
    await claimRun(c, "run-1", "m1");
    await requestStop(p, c, "run-1");
    await releaseRun(c, "run-1");
    const row = await prisma.chat.findUnique({ where: { id: c } });
    expect(row).toMatchObject({ activeRunId: null, activeRequestMessageId: null, stopRequestedRunId: null });
    await expect(claimRun(c, "run-2", "m2")).resolves.toBeUndefined();
  });

  it("lets exactly one of many parallel claims win", async () => {
    const { c } = await setup();
    const r = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => claimRun(c, `run-${i}`, `m${i}`)));
    const ok = r.filter((x) => x.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const winner = (await prisma.chat.findUnique({ where: { id: c } }))!.activeRunId;
    for (const x of r) {
      if (x.status === "rejected") {
        expect(x.reason).toMatchObject({ code: "chat_turn_active", activeTurn: { runId: winner } });
      }
    }
  });

  it("lets exactly one of many parallel claims take over a stale lock", async () => {
    const { c } = await setup();
    await claimRun(c, "old", "mo", new Date(Date.now() - 10 * 60_000));
    const r = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => claimRun(c, `run-${i}`, `m${i}`)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("treats exactly 6 minutes as still active, and 6 minutes plus 1 ms as stale", async () => {
    const { c } = await setup();
    const t = new Date("2026-01-01T00:00:00Z");
    await claimRun(c, "run-1", "m1", t);
    await expect(claimRun(c, "run-2", "m2", new Date(t.getTime() + 6 * 60_000))).rejects.toMatchObject({ code: "chat_turn_active" });
    await expect(claimRun(c, "run-2", "m2", new Date(t.getTime() + 6 * 60_000 + 1))).resolves.toBeUndefined();
  });

  it("a new claim clears a leftover stop flag", async () => {
    const { c } = await setup();
    await prisma.chat.update({ where: { id: c }, data: { stopRequestedRunId: "old-run" } });
    await claimRun(c, "run-1", "m1");
    expect((await prisma.chat.findUnique({ where: { id: c } }))!.stopRequestedRunId).toBeNull();
    expect(await isStopRequested(c, "old-run")).toBe(false);
  });

  it("takes over a lock whose start time is missing", async () => {
    const { c } = await setup();
    await prisma.chat.update({ where: { id: c }, data: { activeRunId: "ghost", activeRunStartedAt: null } });
    await expect(claimRun(c, "run-2", "m2")).resolves.toBeUndefined();
    expect((await prisma.chat.findUnique({ where: { id: c } }))!.activeRunId).toBe("run-2");
  });

  it("claim on a missing or deleted chat is chat_not_found", async () => {
    const { p, c } = await setup();
    await expect(claimRun(randomUUID(), "r", "m")).rejects.toMatchObject({ code: "chat_not_found" });
    await deleteChat(p, c);
    await expect(claimRun(c, "r", "m")).rejects.toMatchObject({ code: "chat_not_found" });
  });

  it("requestStop flags only the active run", async () => {
    const { p, c } = await setup();
    await claimRun(c, "run-1", "m1");
    expect(await requestStop(p, c, "run-2")).toBe(false);
    expect(await isStopRequested(c, "run-1")).toBe(false);
    expect(await requestStop(p, c, "run-1")).toBe(true);
    expect(await isStopRequested(c, "run-1")).toBe(true);
    expect(await isStopRequested(c, "run-2")).toBe(false);
  });

  it("requestStop is scoped to the profile", async () => {
    const { c } = await setup();
    await claimRun(c, "run-1", "m1");
    const other = await ensureAccount(clerk(2));
    expect(await requestStop(other.currentProfile!.id, c, "run-1")).toBe(false);
    expect(await isStopRequested(c, "run-1")).toBe(false);
  });
});

describe("messages", () => {
  it("stores a user message once per id", async () => {
    const { p, c } = await setup();
    const m = msg();
    expect(await saveUserMessage(c, m)).toEqual({ created: true });
    expect(await saveUserMessage(c, m)).toEqual({ created: false });
    const list = await listMessages(p, c);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: m.id, role: "user", parts: m.parts, metadata: m.metadata, context: m.context });
  });

  it("stores a user message once under parallel calls and bumps activity", async () => {
    const { p, c } = await setup();
    const before = (await prisma.chat.findUnique({ where: { id: c } }))!.lastActivityAt;
    const m = msg();
    const r = await Promise.all(Array.from({ length: 10 }, () => saveUserMessage(c, m)));
    expect(r.filter((x) => x.created)).toHaveLength(1);
    expect(await listMessages(p, c)).toHaveLength(1);
    expect((await prisma.chat.findUnique({ where: { id: c } }))!.lastActivityAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("rejects a user message id that belongs to another profile's chat", async () => {
    const { c } = await setup();
    const other = await ensureAccount(clerk(2));
    const oc = randomUUID();
    await getOrCreateChat(other.currentProfile!.id, other.user.id, oc);
    const m = msg();
    await saveUserMessage(oc, m);
    await expect(saveUserMessage(c, m)).rejects.toMatchObject({ code: "message_id_conflict" });
    expect(await prisma.message.count({ where: { id: m.id } })).toBe(1);
  });

  it("rejects a user message id that is already an assistant message", async () => {
    const { c } = await setup();
    const id = randomUUID();
    await saveAssistantMessage(c, { ...msg(id), runId: "r" });
    await expect(saveUserMessage(c, msg(id))).rejects.toMatchObject({ code: "message_id_conflict" });
  });

  it("rejects an assistant message id owned by another chat or a user message", async () => {
    const { p, u, c } = await setup();
    const c2 = randomUUID();
    await getOrCreateChat(p, u, c2);
    const a = randomUUID();
    await saveAssistantMessage(c2, { ...msg(a), runId: "r", parts: [{ type: "text", text: "orig" }] });
    await expect(saveAssistantMessage(c, { ...msg(a), runId: "r2" })).rejects.toMatchObject({ code: "message_id_conflict" });
    const row = await prisma.message.findUnique({ where: { id: a } });
    expect(row).toMatchObject({ chatId: c2, parts: [{ type: "text", text: "orig" }], runId: "r" });
    const um = msg();
    await saveUserMessage(c, um);
    await expect(saveAssistantMessage(c, { ...msg(um.id), runId: "r" })).rejects.toMatchObject({ code: "message_id_conflict" });
    expect(await prisma.message.findUnique({ where: { id: um.id } })).toMatchObject({ role: "USER", runId: null });
  });

  it("upserts an assistant message by id", async () => {
    const { p, c } = await setup();
    const id = randomUUID();
    await saveAssistantMessage(c, { ...msg(id), runId: "run-1", context: { v: 1 } });
    await saveAssistantMessage(c, { ...msg(id), runId: "run-1", parts: [{ type: "text", text: "final" }], context: { v: 2 } });
    const list = await listMessages(p, c);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ role: "assistant", parts: [{ type: "text", text: "final" }], context: { v: 2 } });
  });

  it("upserts an assistant message once under parallel calls", async () => {
    const { p, c } = await setup();
    const id = randomUUID();
    await Promise.all(Array.from({ length: 8 }, () => saveAssistantMessage(c, { ...msg(id), runId: "run-1" })));
    expect(await listMessages(p, c)).toHaveLength(1);
  });

  it("orders messages by seq when createdAt ties", async () => {
    const { p, c } = await setup();
    const at = new Date();
    for (const id of ["z", "m", "a"]) {
      await prisma.message.create({ data: { id: `${id}-${c}`, chatId: c, role: "USER", parts: [], createdAt: at } });
    }
    expect((await listMessages(p, c)).map((m) => m.id)).toEqual([`z-${c}`, `m-${c}`, `a-${c}`]);
  });

  it("does not list messages across profiles or for deleted chats", async () => {
    const { p, c } = await setup();
    await saveUserMessage(c, msg());
    const other = await ensureAccount(clerk(2));
    await expect(listMessages(other.currentProfile!.id, c)).rejects.toMatchObject({ code: "chat_not_found" });
    await deleteChat(p, c);
    await expect(listMessages(p, c)).rejects.toMatchObject({ code: "chat_not_found" });
  });

  it("returns the context of the latest assistant message", async () => {
    const { c } = await setup();
    expect(await lastAssistantContext(c)).toBeNull();
    await saveAssistantMessage(c, { ...msg(), runId: "r1", context: { activeTask: "one" } });
    await saveUserMessage(c, msg());
    await saveAssistantMessage(c, { ...msg(), runId: "r2", context: { activeTask: "two" } });
    await saveUserMessage(c, msg());
    expect(await lastAssistantContext(c)).toEqual({ activeTask: "two" });
  });
});

describe("history", () => {
  async function seed(p: string, u: string, n: number) {
    const base = Date.now() - 1_000_000;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = randomUUID();
      ids.push(id);
      await prisma.chat.create({ data: { id, profileId: p, userId: u, title: `c${i}`, lastActivityAt: new Date(base + i * 1000) } });
    }
    return ids; // oldest first
  }

  it("lists pinned first then newest, with hasMore at 21 chats", async () => {
    const { p, u, c } = await setup();
    await prisma.chat.delete({ where: { id: c } });
    const ids = await seed(p, u, 21);
    await setChatPinned(p, ids[0]!, true);
    const page1 = await listChats(p);
    expect(page1.chats).toHaveLength(20);
    expect(page1.hasMore).toBe(true);
    expect(page1.chats[0]!.id).toBe(ids[0]);
    expect(page1.chats[1]!.id).toBe(ids[20]);
    const page2 = await listChats(p, { before: page1.chats[19]!.id });
    expect(page2.chats.map((x) => x.id)).toEqual([ids[1]]);
    expect(page2.hasMore).toBe(false);
    const all = await listChats(p, { limit: 50 });
    expect(all.chats).toHaveLength(21);
    expect(all.hasMore).toBe(false);
  });

  it("is scoped to the profile", async () => {
    const { p, c } = await setup();
    const other = await ensureAccount(clerk(2));
    expect((await listChats(other.currentProfile!.id)).chats).toHaveLength(0);
    expect((await listChats(p)).chats.map((x) => x.id)).toEqual([c]);
    expect((await listChats(other.currentProfile!.id, { before: c })).chats).toHaveLength(0);
  });

  it("hides deleted chats", async () => {
    const { p, c } = await setup();
    await deleteChat(p, c);
    expect(await getChat(p, c)).toBeNull();
    expect((await listChats(p)).chats).toHaveLength(0);
    await expect(renameChat(p, c, "x")).rejects.toMatchObject({ code: "chat_not_found" });
    await expect(setChatPinned(p, c, true)).rejects.toMatchObject({ code: "chat_not_found" });
  });

  it("does not let another profile delete, rename or pin", async () => {
    const { p, c } = await setup();
    const o = (await ensureAccount(clerk(2))).currentProfile!.id;
    await expect(deleteChat(o, c)).rejects.toMatchObject({ code: "chat_not_found" });
    await expect(renameChat(o, c, "x")).rejects.toMatchObject({ code: "chat_not_found" });
    await expect(setChatPinned(o, c, true)).rejects.toMatchObject({ code: "chat_not_found" });
    expect(await getChat(p, c)).not.toBeNull();
  });

  it("renames with a trimmed 1..120 title", async () => {
    const { p, c } = await setup();
    await renameChat(p, c, "  Hello  ");
    expect((await getChat(p, c))!.title).toBe("Hello");
    await expect(renameChat(p, c, "   ")).rejects.toThrow(/title/i);
    await expect(renameChat(p, c, "x".repeat(121))).rejects.toThrow(/title/i);
    expect((await getChat(p, c))!.title).toBe("Hello");
  });

  it("sets an auto title only while the title is the default", async () => {
    const { p, c } = await setup();
    await setTitleIfDefault(c, "Auto title");
    expect((await getChat(p, c))!.title).toBe("Auto title");
    await setTitleIfDefault(c, "Second");
    expect((await getChat(p, c))!.title).toBe("Auto title");
  });
});
