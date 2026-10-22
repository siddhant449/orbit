import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { getCredits } from "./credits";
import { account, cleanupVisualTests, setBalance } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const DAY = 86_400_000;

describe("getCredits", () => {
  it("creates the account on first read with 30 credits and a refill date 30 days out", async () => {
    const a = await account("c1");
    const now = new Date("2026-10-22T10:00:00Z");
    const c = await getCredits(a.teamId, now);
    expect(c).toMatchObject({ balance: 30, monthlyAllocation: 30 });
    expect(c.periodStartedAt).toEqual(now);
    expect(c.refillsAt).toEqual(new Date(now.getTime() + 30 * DAY));
    expect((await getCredits(a.teamId, new Date(now.getTime() + DAY))).periodStartedAt).toEqual(now); // second read changes nothing
  });

  it("refills to the allocation after 30 days (no rollover) and advances by whole periods", async () => {
    const a = await account("c2");
    const start = new Date("2026-01-01T00:00:00Z");
    await setBalance(a.teamId, 0, start);
    expect((await getCredits(a.teamId, new Date(start.getTime() + 29 * DAY))).balance).toBe(0);
    const after31 = await getCredits(a.teamId, new Date(start.getTime() + 31 * DAY));
    expect(after31.balance).toBe(30);
    expect(after31.periodStartedAt).toEqual(new Date(start.getTime() + 30 * DAY));

    await setBalance(a.teamId, 7, start);
    const after95 = await getCredits(a.teamId, new Date(start.getTime() + 95 * DAY));
    expect(after95.balance).toBe(30); // a reset, not +30 per missed period
    expect(after95.periodStartedAt).toEqual(new Date(start.getTime() + 90 * DAY));

    const resets = await prisma.creditLedger.findMany({ where: { teamId: a.teamId, reason: "MONTHLY_RESET" }, orderBy: { createdAt: "asc" } });
    expect(resets.map((r) => r.delta)).toEqual([30, 23]);
    expect(resets.every((r) => r.balanceAfter === 30)).toBe(true);
  });

  it("is per team: another team has its own pool", async () => {
    const a = await account("c3");
    const b = await account("c4");
    await setBalance(a.teamId, 3);
    expect((await getCredits(a.teamId, new Date())).balance).toBe(3);
    expect((await getCredits(b.teamId, new Date())).balance).toBe(30);
  });

  it("concurrent first reads create one account", async () => {
    const a = await account("c5");
    const now = new Date();
    const all = await Promise.all(Array.from({ length: 4 }, () => getCredits(a.teamId, now)));
    expect(all.every((c) => c.balance === 30)).toBe(true);
    expect(await prisma.creditAccount.count({ where: { teamId: a.teamId } })).toBe(1);
  });
});
