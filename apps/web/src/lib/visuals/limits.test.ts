import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; teamId: string } | null; team: { id: string } } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { createUsageLimiter, memoryStore } from "@brandloop/ai";
import { getCredits, prisma } from "@brandloop/db";
import { idleJobs } from "@/lib/jobs";
import { createVisualHandler } from "./handlers";
import { checkVisualLimits, setVisualLimitsForTest } from "./limits";
import { installVisualsEnv, makeAccount, wipe, type TestAccount } from "./test-helpers";

const PREFIX = "vtest_vlimits";
let a: TestAccount;
let cleanup: () => Promise<void>;
let t: number;

const body = () => ({ source: "library", prompt: "Three habits as a list", visualType: "INFOGRAPHIC", aspect: "PORTRAIT_4_5", useBrandColours: false, requestId: crypto.randomUUID() });
const post = () => createVisualHandler(new Request("http://test/api/visuals", { method: "POST", body: JSON.stringify(body()) }));
const profile = () => ({ id: a.profileId, teamId: a.teamId });

beforeAll(async () => {
  await wipe(PREFIX);
  a = await makeAccount(PREFIX, 1);
});
afterAll(() => wipe(PREFIX));
beforeEach(async () => {
  t = Date.parse("2026-10-22T10:00:00Z");
  setVisualLimitsForTest(createUsageLimiter({ store: memoryStore(() => t), now: () => t }), () => new Date(t));
  env.account = { user: { id: a.userId }, team: { id: a.teamId }, currentProfile: profile() };
  await prisma.creditAccount.upsert({ where: { teamId: a.teamId }, create: { teamId: a.teamId, balance: 30 }, update: { balance: 30, periodStartedAt: new Date() } });
  await prisma.visual.deleteMany({ where: { teamId: a.teamId } });
  await prisma.creditLedger.deleteMany({ where: { teamId: a.teamId } });
  cleanup = await installVisualsEnv();
});
afterEach(async () => {
  await idleJobs();
  await cleanup();
  setVisualLimitsForTest(null);
  vi.unstubAllEnvs();
});

describe("image cost guards", () => {
  it("the 41st operation of the day is a 429 and the balance is unchanged; the counter resets at UTC midnight", async () => {
    for (let i = 0; i < 40; i++) expect((await checkVisualLimits(profile())).ok).toBe(true);
    const balance = (await getCredits(a.teamId)).balance;
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("daily_limit");
    expect((await getCredits(a.teamId)).balance).toBe(balance);
    t = Date.parse("2026-10-23T00:00:05Z");
    expect((await checkVisualLimits(profile())).ok).toBe(true);
  });

  it("the global daily limit is a 503 visuals_paused", async () => {
    vi.stubEnv("VISUALS_GLOBAL_DAILY_LIMIT", "2");
    expect((await checkVisualLimits(profile())).ok).toBe(true);
    expect((await checkVisualLimits(profile())).ok).toBe(true);
    expect(await checkVisualLimits(profile())).toMatchObject({ ok: false, status: 503, code: "visuals_paused" });
  });

  it("a third concurrent operation is a 429 too_many_active", async () => {
    for (let i = 0; i < 2; i++) {
      await prisma.visual.create({
        data: { profileId: a.profileId, teamId: a.teamId, createdByUserId: a.userId, type: "GENERAL", aspect: "SQUARE", userPrompt: "x", status: "PROCESSING", activeOp: "generate", activeOpStartedAt: new Date(t), requestId: `r${i}-${Date.now()}` },
      });
    }
    expect(await checkVisualLimits(profile())).toMatchObject({ ok: false, status: 429, code: "too_many_active" });
    const before = (await getCredits(a.teamId)).balance;
    const res = await post();
    expect(res.status).toBe(429);
    expect((await getCredits(a.teamId)).balance).toBe(before);
  });

  it("an operation stuck for over ten minutes no longer counts", async () => {
    for (let i = 0; i < 2; i++) {
      await prisma.visual.create({
        data: { profileId: a.profileId, teamId: a.teamId, createdByUserId: a.userId, type: "GENERAL", aspect: "SQUARE", userPrompt: "x", status: "PROCESSING", activeOp: "generate", activeOpStartedAt: new Date(t - 11 * 60_000), requestId: `s${i}-${Date.now()}` },
      });
    }
    expect((await checkVisualLimits(profile())).ok).toBe(true);
  });

  it("the kill switch refuses create with 503 before anything is debited", async () => {
    vi.stubEnv("VISUALS_PAUSED", "1");
    const before = (await getCredits(a.teamId)).balance;
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("visuals_paused");
    expect((await getCredits(a.teamId)).balance).toBe(before);
  });
});
