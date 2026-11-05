import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; timezone: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account, ACCOUNT_CACHE_TAG: "account" }));
vi.mock("next/cache", () => ({ revalidateTag: () => {}, unstable_cache: (f: unknown) => f }));

import type { AiClient } from "@brandloop/ai";
import { memoryStore, createUsageLimiter } from "@brandloop/ai";
import { ensureAccount, listNotifications, prisma } from "@brandloop/db";
import {
  draftIdeaHandler, getWeeklyHandler, patchGenerationDayHandler, patchIdeaHandler, postWeeklyHandler, setIdeasWeeklyLimiterForTest,
} from "../ideas-weekly-api";
import { CRON_MAX_PROFILES, checkCronAuth, getCronHandler, runDailyCron, selectDueProfiles } from "./cron";
import { saveChatIdeas } from "./chat-save";
import { generateWeeklyIdeas } from "./weekly";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const CLERK = "user_webtest_weekly";
const NOW = new Date("2026-11-04T10:00:00Z"); // a Wednesday
const WEEK = "2026-11-02";

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  for (let attempt = 1; ; attempt++) {
    try {
      await assertTestDatabase(prisma);
      await prisma.team.deleteMany({ where: { name: { endsWith: " (webtest)" }, memberships: { some: { user: users } } } });
      await prisma.user.deleteMany({ where: users });
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

const SUBJECTS = ["Pricing", "Hiring", "Burnout", "Roadmaps", "Sales", "Churn", "Onboarding", "Fundraising"];
const OPENERS = ["Most", "Last", "Every", "Nobody", "Three", "Why", "Before", "If"];
const idea = (n: number) => ({ title: `Idea ${n}: ${SUBJECTS[n - 1]}`, angle: `Angle ${n}`, hook: `${OPENERS[n - 1]} hook ${n}`, format: "text", contentType: "personal", why: `Why ${n}` });
function fakeAi(): AiClient & { calls: number } {
  const ai = {
    calls: 0,
    async text() {
      return "";
    },
    async json({ schema }: { schema: { parse(v: unknown): unknown } }) {
      ai.calls++;
      return schema.parse({ ideas: [1, 2, 3, 4, 5, 6, 7, 8].map(idea) });
    },
  };
  return ai as unknown as AiClient & { calls: number };
}

let me: { userId: string; profileId: string };
let other: { userId: string; profileId: string };

async function makeAccount(n: number) {
  const acc = await ensureAccount({ clerkId: `${CLERK}${n}`, email: `webweekly${n}@example.test`, firstName: "W", teamNameSuffix: " (webtest)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}
const as = (p: { userId: string; profileId: string }) => (env.account = { user: { id: p.userId }, currentProfile: { id: p.profileId, timezone: "UTC" } });

beforeAll(async () => {
  await wipe();
  me = await makeAccount(1);
  other = await makeAccount(2);
});
beforeEach(async () => {
  as(me);
  await prisma.idea.deleteMany({ where: { profileId: { in: [me.profileId, other.profileId] } } });
  await prisma.notification.deleteMany({ where: { profileId: { in: [me.profileId, other.profileId] } } });
  await prisma.profile.updateMany({ where: { id: { in: [me.profileId, other.profileId] } }, data: { lastActiveAt: null, generationDayOfWeek: 1, timezone: "UTC" } });
  setIdeasWeeklyLimiterForTest(createUsageLimiter({ store: memoryStore(), failClosed: false }));
});
afterAll(async () => {
  setIdeasWeeklyLimiterForTest(null);
  await wipe();
});

describe("generateWeeklyIdeas", () => {
  it("creates once and posts one IDEAS_READY notification", async () => {
    const ai = fakeAi();
    const results = await Promise.all([1, 2, 3].map(() => generateWeeklyIdeas(me.profileId, { ai, now: () => NOW })));
    expect(results.filter((r) => r === "created")).toHaveLength(1);
    expect(results.every((r) => r === "created" || r === "exists")).toBe(true);
    expect(await generateWeeklyIdeas(me.profileId, { ai, now: () => NOW })).toBe("exists");
    const rows = await prisma.idea.findMany({ where: { profileId: me.profileId, origin: "weekly" }, orderBy: { position: "asc" } });
    expect(rows).toHaveLength(5);
    expect(rows[0]!.weekStartOn.toISOString().slice(0, 10)).toBe(WEEK);
    expect(rows[0]!.prompt).toMatch(/^Draft a LinkedIn post from this idea: /);
    const events = (await listNotifications(me.profileId)).items;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "IDEAS_READY", title: "This week's ideas are ready", href: "/ideas" });
  });

  it("fails without retrying, stores nothing and posts nothing", async () => {
    const ai = { calls: 0, text: async () => "", json: async () => { ai.calls++; throw new Error("boom"); } } as unknown as AiClient & { calls: number };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await generateWeeklyIdeas(me.profileId, { ai, now: () => NOW })).toBe("failed");
    quiet.mockRestore();
    expect(ai.calls).toBe(1);
    expect(await prisma.idea.count({ where: { profileId: me.profileId } })).toBe(0);
    expect((await listNotifications(me.profileId)).items).toHaveLength(0);
  });
});

describe("daily cron", () => {
  it("rejects a missing or wrong secret", async () => {
    const env = { CRON_SECRET: "s3cret-for-tests", NODE_ENV: "test" };
    const req = (auth?: string) => new Request("http://t/api/cron/daily", { headers: auth ? { authorization: auth } : {} });
    expect((await getCronHandler(req(), { env })).status).toBe(401);
    expect((await getCronHandler(req("Bearer nope"), { env })).status).toBe(401);
    expect((await getCronHandler(req("s3cret-for-tests"), { env })).status).toBe(401);
    expect(checkCronAuth(req(), { NODE_ENV: "production" })!.status).toBe(503);
    expect(checkCronAuth(req(), { NODE_ENV: "test" })!.status).toBe(401);
    expect(checkCronAuth(req("Bearer s3cret-for-tests"), env)).toBeNull();
  });

  it("skips inactive profiles and profiles with this week's batch, caps at 50", async () => {
    // Inactive: never active, and active 15 days ago.
    await prisma.profile.update({ where: { id: me.profileId }, data: { lastActiveAt: new Date(NOW.getTime() - 15 * 86_400_000) } });
    expect(await selectDueProfiles(NOW)).not.toContain(me.profileId);
    // Active but the generation day (Thursday) has not come yet on a Wednesday.
    await prisma.profile.update({ where: { id: me.profileId }, data: { lastActiveAt: new Date(NOW.getTime() - 86_400_000), generationDayOfWeek: 4 } });
    expect(await selectDueProfiles(NOW)).not.toContain(me.profileId);
    // Due.
    await prisma.profile.update({ where: { id: me.profileId }, data: { generationDayOfWeek: 3 } });
    expect(await selectDueProfiles(NOW)).toContain(me.profileId);
    // Already has this week's batch.
    await generateWeeklyIdeas(me.profileId, { ai: fakeAi(), now: () => NOW });
    expect(await selectDueProfiles(NOW)).not.toContain(me.profileId);
    // Next week it is due again.
    expect(await selectDueProfiles(new Date("2026-11-11T10:00:00Z"))).toContain(me.profileId);

    // The cap: many due profiles, only 50 are served by one run.
    const team = await prisma.profile.findUniqueOrThrow({ where: { id: me.profileId }, select: { teamId: true } });
    const ids: string[] = [];
    for (let i = 0; i < CRON_MAX_PROFILES + 5; i++) {
      ids.push((await prisma.profile.create({ data: { teamId: team.teamId, ownerUserId: me.userId, name: `cap ${i}`, lastActiveAt: new Date(NOW.getTime() - 1000 * (i + 1)) } })).id);
    }
    try {
      const due = await selectDueProfiles(NOW, CRON_MAX_PROFILES);
      expect(due.length).toBe(CRON_MAX_PROFILES);
      expect(await selectDueProfiles(NOW, 3)).toHaveLength(3);
    } finally {
      await prisma.profile.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it("runs due profiles once and reports counts", async () => {
    await prisma.profile.update({ where: { id: me.profileId }, data: { lastActiveAt: new Date(NOW.getTime() - 3600_000) } });
    const ai = fakeAi();
    const first = await runDailyCron({ now: () => NOW, ai, limit: 2 });
    expect(first.generated).toBeGreaterThanOrEqual(1);
    const callsAfterFirst = ai.calls;
    const second = await runDailyCron({ now: () => NOW, ai, limit: 2 });
    expect(second.generated).toBe(0);
    expect(ai.calls).toBe(callsAfterFirst);
  });
});

describe("weekly API", () => {
  it("on-demand POST returns 409 when the batch exists, and is limited to 2 a day", async () => {
    const ai = fakeAi();
    const res = await postWeeklyHandler({ ai, now: () => NOW });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { weeks: { ideas: unknown[] }[] }).weeks[0]!.ideas).toHaveLength(5);
    const again = await postWeeklyHandler({ ai, now: () => NOW });
    expect(again.status).toBe(409);
    expect(ai.calls).toBe(1);
    // The daily limit counts attempts that reach generation: two failures use it up.
    await prisma.idea.deleteMany({ where: { profileId: me.profileId } });
    const failing = { text: async () => "", json: async () => { throw new Error("x"); } } as unknown as AiClient;
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await postWeeklyHandler({ ai: failing, now: () => NOW })).status).toBe(502);
    quiet.mockRestore();
    expect((await postWeeklyHandler({ ai, now: () => NOW })).status).toBe(429);
  });

  it("generation day changes are limited to 3 a week", async () => {
    const store = memoryStore();
    const patch = (day: number) => patchGenerationDayHandler(new Request("http://t", { method: "PATCH", body: JSON.stringify({ day }) }), { store });
    expect((await patch(2)).status).toBe(200);
    expect((await patch(3)).status).toBe(200);
    expect((await patch(4)).status).toBe(200);
    const blocked = await patch(5);
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toBe("You can change this again next week.");
    expect((await prisma.profile.findUniqueOrThrow({ where: { id: me.profileId } })).generationDayOfWeek).toBe(4);
    expect((await patch(4)).status).toBe(200); // the same day is not a change
    expect((await patch(9)).status).toBe(400);
  });

  it("hide and draft are per profile; a double draft makes one chat", async () => {
    await generateWeeklyIdeas(me.profileId, { ai: fakeAi(), now: () => NOW });
    const ideaId = (await prisma.idea.findFirstOrThrow({ where: { profileId: me.profileId }, orderBy: { position: "asc" } })).id;
    const patch = (hidden: boolean) => patchIdeaHandler(new Request("http://t", { method: "PATCH", body: JSON.stringify({ hidden }) }), ideaId);
    expect((await patch(true)).status).toBe(200);
    expect((await prisma.idea.findUniqueOrThrow({ where: { id: ideaId } })).hidden).toBe(true);
    expect((await patch(false)).status).toBe(200);

    const both = await Promise.all([draftIdeaHandler(ideaId), draftIdeaHandler(ideaId)]);
    const ids = await Promise.all(both.map(async (r) => ((await r.json()) as { chatId: string }).chatId));
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.chat.count({ where: { profileId: me.profileId, deletedAt: null } })).toBe(1);
    expect((await prisma.idea.findUniqueOrThrow({ where: { id: ideaId } })).drafted).toBe(true);

    as(other);
    expect((await patch(true)).status).toBe(404);
    expect((await draftIdeaHandler(ideaId)).status).toBe(404);
    expect(((await (await getWeeklyHandler({ now: () => NOW })).json()) as { weeks: unknown[] }).weeks).toHaveLength(0);
  });
});

describe("chat ideas", () => {
  it("chat ideas are stored with origin chat", async () => {
    const card = (n: number) => ({ hook: `Hook ${n}`, angle: `Angle ${n}`, why: "w", badge: "From your story", sourceKind: "story", sourceRef: `ref ${n}` });
    await saveChatIdeas(me.profileId, [card(1), card(2)], NOW);
    await saveChatIdeas(me.profileId, [card(3)], NOW);
    const rows = await prisma.idea.findMany({ where: { profileId: me.profileId }, orderBy: { position: "asc" } });
    expect(rows.map((r) => [r.origin, r.position, r.title])).toEqual([["chat", 0, "Hook 1"], ["chat", 1, "Hook 2"], ["chat", 2, "Hook 3"]]);
    expect(rows[0]!.weekStartOn.toISOString().slice(0, 10)).toBe(WEEK);
    expect(rows[0]!.category).toBe("From your story");
    // A weekly batch for the same week still gets its own positions.
    expect(await generateWeeklyIdeas(me.profileId, { ai: fakeAi(), now: () => NOW })).toBe("created");
  });
});
