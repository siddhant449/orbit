import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (kleo-clone-db-1); Clerk and the model are faked.
const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; timezone: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import type { AiClient } from "@brandloop/ai";
import { createDocumentForChat, ensureAccount, getOrCreateChat, prisma, saveStrategy, upsertMemory } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { postIdeasHandler } from "./ideas-api";

// The shared database is slow while other worktrees run their suites.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { createRateLimiter } from "./rate-limit";
import { AI_UNAVAILABLE_MESSAGE } from "./run-job";

// Not "user_test_": the db package suites (run by other worktrees on the shared database) wipe that prefix wholesale.
const CLERK = "user_webtest_ideas";
let me: { userId: string; profileId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  // Other worktrees' suites delete on the same tables at the same time; retry a lock conflict.
  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.team.deleteMany({ where: { name: { endsWith: " (webtest)" }, memberships: { some: { user: users } } } });
      await prisma.user.deleteMany({ where: users });
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

// Distinct subjects and hook openers, so the variety pass keeps all of them.
const SUBJECTS = ["Pricing", "Hiring", "Burnout", "Roadmaps", "Sales", "Churn", "Onboarding", "Fundraising"];
const OPENERS = ["Most", "Last", "Every", "Nobody", "Three", "Why", "Before", "If"];
const idea = (n: number) => ({
  title: `Idea ${n}: ${SUBJECTS[n - 1]}`,
  angle: `Angle ${n}`,
  hook: `${OPENERS[n - 1]} hook ${n}`,
  format: "text",
  contentType: "personal",
  why: `Why ${n}`,
});

function fakeAi(): AiClient & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async text() {
      return "";
    },
    async json({ prompt, schema }) {
      prompts.push(prompt);
      return schema.parse({ ideas: [1, 2, 3, 4, 5, 6, 7, 8].map(idea) });
    },
  };
}

const post = (body: unknown = {}) => new Request("http://test/api/ideas", { method: "POST", body: JSON.stringify(body) });
const NOW = () => new Date("2026-10-22T10:00:00Z");
// A roomy limiter for the tests that aren't about throttling (the default one is shared per process).
const open = createRateLimiter({ limit: 1000, windowMs: 1000 });

beforeAll(async () => {
  await wipe();
  const acc = await ensureAccount({ clerkId: `${CLERK}1`, email: "webideas1@example.test", firstName: "Ideas", teamNameSuffix: " (webtest)" });
  me = { userId: acc.user.id, profileId: acc.currentProfile!.id };
});
afterAll(wipe);
beforeEach(() => {
  env.account = { user: { id: me.userId }, currentProfile: { id: me.profileId, timezone: "UTC" } };
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ideas", () => {
  it("needs a profile", async () => {
    env.account = { user: { id: me.userId }, currentProfile: null };
    const res = await postIdeasHandler(post(), { limiter: open, ai: fakeAi() });
    expect(res.status).toBe(400);
  });

  it("returns 503 with the setup message when no key is configured and mock mode is off", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MOCK_MODEL", "");
    const res = await postIdeasHandler(post(), { limiter: open });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: AI_UNAVAILABLE_MESSAGE });
  });

  it("generates the requested number of ideas for the week, from an empty profile", async () => {
    const ai = fakeAi();
    const res = await postIdeasHandler(post({ count: 3 }), { limiter: open, ai, now: NOW });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.weekOf).toBe("2026-10-19");
    expect(body.ideas).toHaveLength(3);
    expect(body.ideas[0]).toMatchObject({ id: "idea-1", title: "Idea 1: Pricing", hook: "Most hook 1" });
    expect(body.basis).toEqual({ strategy: false, memoryFiles: 0, recentDrafts: 0 });
    expect(ai.prompts[0]).toContain("(no strategy yet)");
  });

  it("builds the prompt from the strategy, memory and recent drafts", async () => {
    await saveStrategy(me.profileId, {
      goal: "build_authority",
      goalWhy: "g",
      positioning: "Pricing for bootstrapped founders",
      positioningWhy: "p",
      tagline: "t",
      expertise: "e",
      expertiseWhy: "w",
      contentMix: [{ type: "educational", percent: 100 }],
      audienceBalance: [{ level: "niche", percent: 100, note: "n" }],
      contentFormats: [{ format: "text", perWeek: 3, note: "n" }],
      recurringSeries: [],
    });
    await upsertMemory(me.profileId, "identity/about", "- Ran a bakery for ten years", "USER");
    const chatId = randomUUID();
    await getOrCreateChat(me.profileId, me.userId, chatId);
    await createDocumentForChat(me.profileId, chatId, { title: "Bakery lessons", text: "What flour taught me about churn" });

    const ai = fakeAi();
    const res = await postIdeasHandler(post({ count: 5 }), { limiter: open, ai, now: NOW });
    const body = await res.json();
    expect(body.ideas).toHaveLength(5);
    expect(body.basis).toMatchObject({ strategy: true, recentDrafts: 1 });
    expect(body.basis.memoryFiles).toBeGreaterThanOrEqual(2); // identity/about + the strategy mirror
    const prompt = ai.prompts[0]!;
    expect(prompt).toContain("Pricing for bootstrapped founders");
    expect(prompt).toContain("Ran a bakery for ten years");
    expect(prompt).toContain("What flour taught me about churn");
  });

  it("reports a model failure as 502 with a safe message", async () => {
    const ai: AiClient = {
      async text() {
        return "";
      },
      async json() {
        throw new Error("The model declined this request.");
      },
    };
    const res = await postIdeasHandler(post(), { limiter: open, ai });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Orbit couldn't generate ideas this time. Try again." });
  });

  it("uses the scripted ideas in mock mode without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MOCK_MODEL", "1");
    const res = await postIdeasHandler(post({ count: 3 }), { limiter: open, now: NOW });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ideas).toHaveLength(3);
    expect(body.ideas[0].hook.length).toBeGreaterThan(0);
  });

  it("sends previously shown ideas to the model to avoid", async () => {
    const ai = fakeAi();
    await postIdeasHandler(post({ count: 3, previous: [{ title: "MVP versus POC", hook: "Most founders build a POC" }] }), { limiter: open, ai });
    expect(ai.prompts[0]).toContain("<previous_ideas>");
    expect(ai.prompts[0]).toContain("MVP versus POC");
  });

  it("refuses a body over 2 KB before parsing it", async () => {
    const res = await postIdeasHandler(post({ count: 3, pad: "x".repeat(3000) }), { limiter: open, ai: fakeAi() });
    expect(res.status).toBe(413);
  });

  it("throttles each profile", async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const ai = fakeAi();
    expect((await postIdeasHandler(post(), { ai, limiter })).status).toBe(200);
    expect((await postIdeasHandler(post(), { ai, limiter })).status).toBe(200);
    const res = await postIdeasHandler(post(), { ai, limiter });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(ai.prompts).toHaveLength(2);
  });
});
