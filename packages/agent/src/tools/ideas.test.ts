import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, upsertMemory } from "@brandloop/db";
import type { TurnContext } from "../context";
import { scriptedAi } from "../mock";
import { cleanup, fakeAi, testContext } from "../test/fixtures";
import { generateIdeasRun, type IdeasPickerOutput } from "./ideas";
import { resolveOptionPick } from "./options";

let ctx: TurnContext;
beforeEach(async () => {
  await cleanup();
  ctx = await testContext({ chatId: "00000000-0000-4000-8000-000000000002" });
  ctx.ai = scriptedAi();
});
afterAll(cleanup);

async function seed() {
  for (const [title, content] of [["Client onboarding teardown", "We cut onboarding from 9 steps to 4."], ["Pricing page experiment", "A flat price beat tiers in our test."]] as const) {
    const teamId = (await prisma.profile.findUniqueOrThrow({ where: { id: ctx.profileId } })).teamId;
    await prisma.knowledgeItem.create({ data: { profileId: ctx.profileId, teamId, title, type: "TEXT", status: "READY", content } });
  }
  await upsertMemory(ctx.profileId, "identity/story", "- Lost a client by overpromising a deadline in year one\n- Hired a designer before an engineer and regretted the order", "USER");
  await prisma.strategy.create({ data: { profileId: ctx.profileId, goal: "build_authority", positioning: "Design ops", recurringSeries: [{ name: "Hiring Mondays", weekday: "mon", description: "Lessons on hiring" }, { name: "Pricing notes", weekday: "thu", description: "How to price work" }], contentMix: [{ type: "educational", percent: 100 }] } });
}

describe("generateIdeas", () => {
  it("ends on a picker of 5 ideas with different sources, each with a hidden brief", async () => {
    await seed();
    const out = (await generateIdeasRun(ctx, { count: null })) as IdeasPickerOutput;
    expect(out.shown).toBe(true);
    expect(out.question).toBe("Which idea should we develop first?");
    expect(out.options).toHaveLength(5);
    expect(new Set(out.options.map((o) => o.badge)).size).toBeGreaterThanOrEqual(3);
    expect(out.recommendedOptionId).toMatch(/^idea-\d$/);
    expect(Object.keys(out.briefs)).toHaveLength(5);
    expect(JSON.stringify(out.options)).not.toContain("Invent no personal facts");
  });

  it("hands the picker's ideas to saveIdeas, and a failing save never breaks the reply", async () => {
    await seed();
    const saved: { profileId: string; hooks: string[] }[] = [];
    ctx.saveIdeas = async (profileId, cards) => {
      saved.push({ profileId, hooks: cards.map((c) => c.hook) });
    };
    const out = (await generateIdeasRun(ctx, { count: null })) as IdeasPickerOutput;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.profileId).toBe(ctx.profileId);
    expect(saved[0]!.hooks).toHaveLength(out.options.length);
    ctx.saveIdeas = () => Promise.reject(new Error("db down"));
    expect(((await generateIdeasRun(ctx, { count: null })) as IdeasPickerOutput).options).toHaveLength(5);
  });

  it("uses the extract model alias, and one call", async () => {
    await seed();
    const ai = fakeAi((call: { prompt: string }) => ({ ideas: [...call.prompt.matchAll(/^Slot (\d+) \|/gm)].map((m) => ({ slot: Number(m[1]), hook: `${["Zero", "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"][Number(m[1])]} opening line`, angle: "An angle.", why: "Why." })) }));
    ctx.ai = ai;
    await generateIdeasRun(ctx, { count: 4 });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.model).toBe("extract");
  });

  it("refuses to invent when there is no material", async () => {
    expect(await generateIdeasRun(ctx, { count: 5 })).toMatch(/^Failed: there is no material/);
  });

  it("a pick resolves to the idea's brief, with the hook and its source facts", async () => {
    await seed();
    const out = (await generateIdeasRun(ctx, { count: 5 })) as IdeasPickerOutput;
    const stored = [{ role: "assistant", parts: [{ type: "tool-generateIdeas", toolCallId: "call_i", state: "output-available", input: { count: 5 }, output: out }] }];
    const second = out.options[1]!;
    const picked = resolveOptionPick(stored, { pickerToolCallId: "call_i", optionId: second.id });
    expect(picked?.label).toBe(second.label);
    expect(picked?.brief).toContain("Opening line to start from:");
    expect(resolveOptionPick(stored, { pickerToolCallId: "call_i", optionId: "idea-99" })).toBeNull();
  });
});
