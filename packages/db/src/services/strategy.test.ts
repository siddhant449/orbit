import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiClient, Strategy as StrategyInput } from "@brandloop/ai";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { listMemory } from "./memory";
import { generateStrategy, getStrategy, saveStrategy } from "./strategy";

async function cleanup() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function profileId() {
  const acc = await ensureAccount({
    clerkId: "user_test_strategy",
    email: "strategy@example.test",
    firstName: "Strat",
    teamNameSuffix: " (test)",
  });
  return acc.currentProfile!.id;
}

const sample = (over: Partial<StrategyInput> = {}): StrategyInput => ({
  goal: "build_authority",
  goalWhy: "You have deep expertise to share.",
  positioning: "The designer who ships systems that teams actually use",
  positioningWhy: "Few designers talk about adoption.",
  tagline: "Design systems, minus the shelfware",
  expertise: "Design systems",
  expertiseWhy: "Ten years of practice.",
  contentMix: [
    { type: "educational", percent: 40 },
    { type: "personal", percent: 40 },
    { type: "authority", percent: 40 },
  ],
  audienceBalance: [
    { level: "broad", percent: 50, note: "Reach" },
    { level: "narrow", percent: 30, note: "Trust" },
    { level: "niche", percent: 20, note: "Clients" },
  ],
  contentFormats: [{ format: "text", perWeek: 3, note: "Core" }],
  recurringSeries: [{ name: "Teardown Tuesday", weekday: "tue", description: "Break down a system" }],
  ...over,
});

describe("saveStrategy", () => {
  it("normalises content mix percents to sum to 100", async () => {
    const pid = await profileId();
    const saved = await saveStrategy(pid, sample());
    const mix = saved.contentMix as { percent: number }[];
    expect(mix.reduce((a, m) => a + m.percent, 0)).toBe(100);
    expect((await getStrategy(pid))?.goal).toBe("build_authority");
  });

  it("mirrors positioning into strategy/themes memory", async () => {
    const pid = await profileId();
    await saveStrategy(pid, sample());
    const doc = (await listMemory(pid)).find((d) => d.key === "strategy/themes");
    expect(doc?.source).toBe("MIRRORED");
    expect(doc?.content).toContain("The designer who ships systems that teams actually use");
    expect(doc?.content).toContain("Teardown Tuesday");
  });

  it("rejects invalid data", async () => {
    const pid = await profileId();
    await expect(saveStrategy(pid, { ...sample(), goal: "nope" } as never)).rejects.toThrow();
  });
});

describe("generateStrategy", () => {
  it("stores what the AI returns", async () => {
    const pid = await profileId();
    let prompt = "";
    const ai = {
      json: async (o: { prompt: string }) => {
        prompt = o.prompt;
        return sample({ goal: "get_customers" });
      },
      text: async () => "",
    } as unknown as AiClient;
    const saved = await generateStrategy(ai, pid);
    expect(saved.goal).toBe("get_customers");
    expect(saved.generatedAt).toBeInstanceOf(Date);
    expect(prompt.length).toBeGreaterThan(0);
  });
});
