import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { assertTestDatabase } from "../test-db";
import { ensureAccount } from "./account";
import { getOrCreateChat } from "./chat";
import { BRIEF_REUSE_MS, findFreshBrief, saveResearchBrief, searchesToday } from "./research";

async function cleanup() {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_research" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function setup(n: number) {
  const acc = await ensureAccount({ clerkId: `user_test_research${n}`, email: `research${n}@example.test`, firstName: "R", teamNameSuffix: " (test)" });
  const profileId = acc.currentProfile!.id;
  const chatId = `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  await getOrCreateChat(profileId, acc.user.id, chatId);
  return { profileId, chatId };
}
const brief = { topic: "AI news", windowStart: "2026-10-19", windowEnd: "2026-10-22", provider: "openai", items: [], exclusions: [], searchCount: 3 };

describe("research briefs", () => {
  it("finds a fresh brief for the same chat, topic and window, and nothing for another", async () => {
    const { profileId, chatId } = await setup(1);
    const saved = await saveResearchBrief(profileId, chatId, brief);
    expect((await findFreshBrief(profileId, chatId, brief))?.id).toBe(saved.id);
    expect(await findFreshBrief(profileId, chatId, { ...brief, topic: "other" })).toBeNull();
    expect(await findFreshBrief(profileId, chatId, { ...brief, windowEnd: "2026-10-23" })).toBeNull();
    expect(await findFreshBrief(profileId, chatId, brief, new Date(Date.now() + BRIEF_REUSE_MS + 60_000))).toBeNull();
  });

  it("counts the searches of the last day for one profile only", async () => {
    const a = await setup(2);
    const b = await setup(3);
    await saveResearchBrief(a.profileId, a.chatId, brief);
    await saveResearchBrief(a.profileId, a.chatId, { ...brief, topic: "t2", searchCount: 2 });
    await saveResearchBrief(b.profileId, b.chatId, brief);
    expect(await searchesToday(a.profileId)).toBe(5);
    expect(await searchesToday(b.profileId)).toBe(3);
    expect(await searchesToday(a.profileId, new Date(Date.now() + BRIEF_REUSE_MS + 60_000))).toBe(0);
  });
});

describe("stripNul", () => {
  it("removes NUL and stray control characters from nested strings but keeps tabs and newlines", async () => {
    const { stripNul } = await import("./research");
    expect(stripNul({ a: "x\u0000y", b: ["p\u0007q", "line\nnext\tcol"], c: 3, d: null })).toEqual({ a: "xy", b: ["pq", "line\nnext\tcol"], c: 3, d: null });
  });
});
