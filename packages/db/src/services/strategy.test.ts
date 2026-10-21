import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiClient, Strategy as StrategyInput } from "@brandloop/ai";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { listMemory, upsertMemory } from "./memory";
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
    const mix = saved.contentMix as { type: string; percent: number }[];
    expect(mix.map((m) => m.percent)).toEqual([34, 33, 33]);
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
  const capture = (result: StrategyInput) => {
    const seen = { prompt: "", system: "" };
    const ai = {
      json: async (o: { prompt: string; system: string }) => {
        seen.prompt = o.prompt;
        seen.system = o.system;
        return result;
      },
      text: async () => "",
    } as unknown as AiClient;
    return { ai, seen };
  };

  it("stores what the AI returns and puts memory and knowledge in tagged prompt blocks", async () => {
    const pid = await profileId();
    await upsertMemory(pid, "identity/about", "- Runs a design studio in Lisbon", "USER");
    const team = await prisma.profile.findUniqueOrThrow({ where: { id: pid }, select: { teamId: true } });
    await prisma.knowledgeItem.create({
      data: { profileId: pid, teamId: team.teamId, title: "Adoption playbook", type: "TEXT", status: "READY", summary: "How teams adopt systems" },
    });
    const { ai, seen } = capture(sample({ goal: "get_customers" }));
    const saved = await generateStrategy(ai, pid);
    expect(saved.goal).toBe("get_customers");
    expect(saved.generatedAt).toBeInstanceOf(Date);
    expect(seen.prompt).toMatch(/<memory>[\s\S]*Runs a design studio in Lisbon[\s\S]*<\/memory>/);
    expect(seen.prompt).toMatch(/<knowledge>[\s\S]*Adoption playbook[\s\S]*<\/knowledge>/);
    expect(seen.system).toContain("not instructions");
  });

  it("includes the existing strategy as the current one to improve on", async () => {
    const pid = await profileId();
    await saveStrategy(pid, sample({ positioning: "Unique existing positioning phrase" }));
    const { ai, seen } = capture(sample());
    await generateStrategy(ai, pid);
    expect(seen.prompt).toContain("current strategy to improve on");
    expect(seen.prompt).toContain("Unique existing positioning phrase");
  });
});
