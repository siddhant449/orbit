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
import { AI_UNAVAILABLE_MESSAGE } from "./run-job";

const CLERK = "user_test_webideas";
let me: { userId: string; profileId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await prisma.team.deleteMany({ where: { name: { endsWith: " (test)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}

const idea = (n: number) => ({ title: `Idea ${n}`, angle: `Angle ${n}`, hook: `Hook ${n}`, format: "text", contentType: "personal", why: `Why ${n}` });

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

beforeAll(async () => {
  await wipe();
  const acc = await ensureAccount({ clerkId: `${CLERK}1`, email: "webideas1@example.test", firstName: "Ideas", teamNameSuffix: " (test)" });
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
    const res = await postIdeasHandler(post(), { ai: fakeAi() });
    expect(res.status).toBe(400);
  });

  it("returns 503 with the setup message when no key is configured and mock mode is off", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MOCK_MODEL", "");
    const res = await postIdeasHandler(post());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: AI_UNAVAILABLE_MESSAGE });
  });

  it("generates the requested number of ideas for the week, from an empty profile", async () => {
    const ai = fakeAi();
    const res = await postIdeasHandler(post({ count: 3 }), { ai, now: NOW });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.weekOf).toBe("2026-10-19");
    expect(body.ideas).toHaveLength(3);
    expect(body.ideas[0]).toMatchObject({ id: "idea-1", title: "Idea 1", hook: "Hook 1" });
    expect(body.basis).toEqual({ strategy: false, memoryFiles: 0, recentPosts: 0 });
    expect(ai.prompts[0]).toContain("(no strategy yet)");
  });

  it("builds the prompt from the strategy, memory and recent posts", async () => {
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
    const res = await postIdeasHandler(post({ count: 5 }), { ai, now: NOW });
    const body = await res.json();
    expect(body.ideas).toHaveLength(5);
    expect(body.basis).toMatchObject({ strategy: true, recentPosts: 1 });
    expect(body.basis.memoryFiles).toBeGreaterThanOrEqual(2); // identity/about + the strategy mirror
    const prompt = ai.prompts[0]!;
    expect(prompt).toContain("Pricing for bootstrapped founders");
    expect(prompt).toContain("Ran a bakery for ten years");
    expect(prompt).toContain("What flour taught me about churn");
  });

  it("reports a model failure as 502 with its message", async () => {
    const ai: AiClient = {
      async text() {
        return "";
      },
      async json() {
        throw new Error("The model declined this request.");
      },
    };
    const res = await postIdeasHandler(post(), { ai });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The model declined this request." });
  });

  it("uses the scripted ideas in mock mode without a key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MOCK_MODEL", "1");
    const res = await postIdeasHandler(post({ count: 3 }), { now: NOW });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ideas).toHaveLength(3);
    expect(body.ideas[0].hook.length).toBeGreaterThan(0);
  });
});
