import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AiBlockedError, assertAiAllowed, bindUsage, reportUsage } from "@brandloop/ai";
import { prisma } from "../client";
import { effectiveDailyCapMicroUsd, flushAiUsage, getAiControls, setAiControls, spendByDay, spendPerUser, spendTotals, userBreakdown } from "./ai-usage";
import { account, cleanupVisualTests, PREFIX } from "./visual-test-helpers";

const NOW = new Date("2026-10-27T15:00:00Z");
const at = (iso: string) => new Date(iso);

async function clearLedger(userIds: string[]) {
  await prisma.aiUsage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { profileId: null, feature: "zz-test" }] } });
}

let a: Awaited<ReturnType<typeof account>>;
let b: Awaited<ReturnType<typeof account>>;

beforeEach(async () => {
  await cleanupVisualTests();
  a = await account("aiu_a");
  b = await account("aiu_b");
});
afterAll(async () => {
  await prisma.aiUsage.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const row = (userId: string, createdAt: Date, feature: string, cost: number, tokens = 100, model = "gpt-6-luna") => ({
  userId, feature, model, createdAt, costMicroUsd: cost, inputTokens: tokens, outputTokens: tokens / 2, ok: true,
});

describe("ledger write path (registered recorder)", () => {
  it("a reported event lands as one row with feature, model, tokens, cost and who; the profile fills user and team", async () => {
    reportUsage({ profileId: a.profileId, chatId: "chat_x", feature: "ideas", model: "gpt-6-luna", inputTokens: 2000, outputTokens: 1000, ok: true });
    await flushAiUsage();
    const rows = await prisma.aiUsage.findMany({ where: { profileId: a.profileId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: a.userId, teamId: a.teamId, chatId: "chat_x", feature: "ideas", model: "gpt-6-luna", inputTokens: 2000, outputTokens: 1000, costMicroUsd: 600 + 1200, ok: true });
    // The table has no text columns at all.
    expect(Object.keys(rows[0]!).sort()).toEqual(["chatId", "costMicroUsd", "createdAt", "feature", "id", "inputTokens", "model", "ok", "outputTokens", "profileId", "teamId", "userId"]);
  });

  it("batches many events into one flush", async () => {
    for (let i = 0; i < 25; i++) reportUsage({ userId: a.userId, feature: "chat", model: "m", inputTokens: 1, outputTokens: 1, ok: true });
    await flushAiUsage();
    expect(await prisma.aiUsage.count({ where: { userId: a.userId } })).toBe(25);
  });
});

describe("aggregation", () => {
  beforeEach(async () => {
    await clearLedger([a.userId, b.userId]);
    await prisma.aiUsage.createMany({
      data: [
        row(a.userId, at("2026-10-27T10:00:00Z"), "chat", 1000),
        row(a.userId, at("2026-10-27T11:00:00Z"), "ideas", 500, 200),
        row(a.userId, at("2026-10-24T11:00:00Z"), "chat", 2000), // 3 days ago: in the 7-day window
        row(a.userId, at("2026-10-10T09:00:00Z"), "images", 40000, 0, "mock"), // 17 days ago: month only
        row(a.userId, at("2026-09-01T09:00:00Z"), "chat", 999999), // outside 30 days
        row(b.userId, at("2026-10-27T01:00:00Z"), "chat", 300),
      ],
    });
  });

  it("per day and feature, last 30 days, UTC days", async () => {
    const rows = await spendByDay(30, NOW); // the table may hold other rows: assert lower bounds on known days/features
    const day27 = rows.filter((r) => r.day === "2026-10-27");
    expect(day27.find((r) => r.feature === "chat")!.costMicroUsd).toBeGreaterThanOrEqual(1300);
    expect(rows.some((r) => r.day === "2026-09-01")).toBe(false);
    expect(rows.find((r) => r.day === "2026-10-10" && r.feature === "images")!.costMicroUsd).toBeGreaterThanOrEqual(40000);
  });

  it("period totals: today, 7 days, 30 days, by feature", async () => {
    const t = await spendTotals(NOW);
    expect(t.today.ideas).toBeGreaterThanOrEqual(500);
    expect(t.week.chat).toBeGreaterThanOrEqual(3300); // 1000 + 2000 + 300
    expect(t.month.images).toBeGreaterThanOrEqual(40000);
    expect(t.week.images ?? 0).toBeLessThan(t.month.images!);
  });

  it("per user: today / 7 d / 30 d cost and tokens, sorted and searched", async () => {
    const { rows, total } = await spendPerUser({ search: PREFIX, sort: "month", dir: "desc", now: NOW });
    expect(total).toBeGreaterThanOrEqual(2);
    const ua = rows.find((r) => r.userId === a.userId)!;
    const ub = rows.find((r) => r.userId === b.userId)!;
    expect(ua).toMatchObject({ todayMicroUsd: 1500, weekMicroUsd: 3500, monthMicroUsd: 43500, todayTokens: 150 + 300, aiBlocked: false, dailyCapMicroUsd: null });
    expect(ub).toMatchObject({ todayMicroUsd: 300, weekMicroUsd: 300, monthMicroUsd: 300 });
    expect(rows.indexOf(ua)).toBeLessThan(rows.indexOf(ub)); // month desc
    const asc = await spendPerUser({ search: PREFIX, sort: "month", dir: "asc", now: NOW });
    expect(asc.rows.indexOf(asc.rows.find((r) => r.userId === a.userId)!)).toBeGreaterThan(asc.rows.indexOf(asc.rows.find((r) => r.userId === b.userId)!));
    expect((await spendPerUser({ search: "aiu_b@", now: NOW })).rows.map((r) => r.userId)).toEqual([b.userId]);
  });

  it("paginates and treats search wildcards literally", async () => {
    const p1 = await spendPerUser({ search: PREFIX, pageSize: 1, page: 1, sort: "name", dir: "asc", now: NOW });
    const p2 = await spendPerUser({ search: PREFIX, pageSize: 1, page: 2, sort: "name", dir: "asc", now: NOW });
    expect(p1.rows).toHaveLength(1);
    expect(p2.rows[0]!.userId).not.toBe(p1.rows[0]!.userId);
    expect((await spendPerUser({ search: "%", now: NOW })).total).toBe(0);
  });

  it("a user's breakdown by feature and model", async () => {
    const rows = await userBreakdown(a.userId, NOW);
    expect(rows.map((r) => [r.feature, r.model, r.costMicroUsd])).toEqual([
      ["images", "mock", 40000],
      ["chat", "gpt-6-luna", 3000],
      ["ideas", "gpt-6-luna", 500],
    ]);
    expect(rows.find((r) => r.feature === "chat")).toMatchObject({ calls: 2, inputTokens: 200, outputTokens: 100 });
  });
});

describe("controls", () => {
  it("a user's own cap overrides the default; null falls back to it", async () => {
    expect(effectiveDailyCapMicroUsd(await getAiControls(a.userId), 3_000_000)).toBe(3_000_000);
    await setAiControls(a.userId, { dailyCapMicroUsd: 500_000 });
    expect(effectiveDailyCapMicroUsd(await getAiControls(a.userId), 3_000_000)).toBe(500_000);
    await setAiControls(a.userId, { dailyCapMicroUsd: null });
    expect(effectiveDailyCapMicroUsd(await getAiControls(a.userId), 3_000_000)).toBe(3_000_000);
    await expect(setAiControls(a.userId, { dailyCapMicroUsd: -1 })).rejects.toThrow(RangeError);
  });

  it("a blocked user is refused by the gate before any model call, and unblocking clears it at once", async () => {
    let called = 0;
    const client = { text: async () => (called++, "x"), json: async () => (called++, {}) as never };
    const ai = bindUsage(client, { userId: a.userId, profileId: a.profileId, feature: "chat" });
    await setAiControls(a.userId, { aiBlocked: true });
    await expect(ai.text({ model: "generate", system: "s", prompt: "p" })).rejects.toBeInstanceOf(AiBlockedError);
    await expect(assertAiAllowed({ profileId: a.profileId })).rejects.toBeInstanceOf(AiBlockedError); // resolved through the profile's owner
    expect(called).toBe(0);
    // Another user is unaffected.
    await expect(bindUsage(client, { userId: b.userId }).text({ model: "generate", system: "s", prompt: "p" })).resolves.toBe("x");
    await setAiControls(a.userId, { aiBlocked: false });
    await expect(ai.text({ model: "generate", system: "s", prompt: "p" })).resolves.toBe("x");
    expect(called).toBe(2);
  });
});
