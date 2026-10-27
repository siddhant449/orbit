import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUsageLimiter, memoryStore } from "@brandloop/ai";
import { ensureAccount, prisma, setAiControls } from "@brandloop/db";
import { createChatSafety } from "./chat-safety";

const CLERK = "vtest_chat_safety_caps";
let userId: string;
let profileId: string;

beforeAll(async () => {
  await prisma.team.deleteMany({ where: { memberships: { some: { user: { clerkId: CLERK } } } } });
  await prisma.user.deleteMany({ where: { clerkId: CLERK } });
  const acc = await ensureAccount({ clerkId: CLERK, email: `${CLERK}@example.test`, firstName: "Caps" });
  userId = acc.user.id;
  profileId = acc.currentProfile!.id;
});
afterAll(async () => {
  await prisma.team.deleteMany({ where: { memberships: { some: { user: { clerkId: CLERK } } } } });
  await prisma.user.deleteMany({ where: { clerkId: CLERK } });
  await prisma.$disconnect();
});

describe("chat safety with per-user controls", () => {
  const safety = () => createChatSafety({ mock: true, limiter: createUsageLimiter({ store: memoryStore(), failClosed: false }) });

  it("the default cap applies until the user has their own, which then overrides it (both directions)", async () => {
    const s = safety();
    // Spend $1 today. The default cap is $3, so the turn is allowed.
    await s.recordUsage(profileId, "gpt-6-sol", { inputTokens: 400_000, outputTokens: 0 }); // 400k x $2.5/M = $1
    expect((await s.check(profileId, userId)).ok).toBe(true);
    // A $0.50 personal cap is below today's spend: refused.
    await setAiControls(userId, { dailyCapMicroUsd: 500_000 });
    expect(await s.check(profileId, userId)).toMatchObject({ ok: false, kind: "daily" });
    // A $10 personal cap is above the $3 default: allowed even after more spend.
    await setAiControls(userId, { dailyCapMicroUsd: 10_000_000 });
    await s.recordUsage(profileId, "gpt-6-sol", { inputTokens: 1_600_000, outputTokens: 0 }); // now $5 total
    expect((await s.check(profileId, userId)).ok).toBe(true);
    // Clearing it returns to the default ($3), which $5 exceeds.
    await setAiControls(userId, { dailyCapMicroUsd: null });
    expect((await s.check(profileId, userId)).ok).toBe(false);
  });

  it("reports whether AI is blocked for the user", async () => {
    const s = safety();
    expect(await s.isBlocked!(userId)).toBe(false);
    await setAiControls(userId, { aiBlocked: true });
    expect(await s.isBlocked!(userId)).toBe(true);
    await setAiControls(userId, { aiBlocked: false });
  });
});
