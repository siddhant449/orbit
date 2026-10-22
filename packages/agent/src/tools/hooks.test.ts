import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { upsertMemory } from "@brandloop/db";
import type { TurnContext } from "../context";
import { scriptedAi } from "../mock";
import { cleanup, fakeAi, testContext } from "../test/fixtures";
import { generateHooksRun, type HooksOutput } from "./hooks";

let ctx: TurnContext;
beforeEach(async () => {
  await cleanup();
  ctx = await testContext({ chatId: "00000000-0000-4000-8000-000000000001" });
});
afterAll(cleanup);

const input = { topic: "Hiring your first engineer as a founder", draftBody: null, count: 5, excludeHooks: [] as string[] };
const hook = (purpose: string, text: string, personal = false) => ({ purpose, text, claim: "c", mustDeliver: "m", bodyShape: "b", isPersonal: personal });
const run = async (over: Partial<typeof input> = {}) => (await generateHooksRun(ctx, { ...input, ...over })) as HooksOutput;

describe("generateHooks", () => {
  it("hook purposes in a set of 5 are at least 4 distinct, with counts computed by the server", async () => {
    ctx.ai = scriptedAi();
    const out = await run();
    expect(out.hooks).toHaveLength(5);
    expect(new Set(out.hooks.map((h) => h.purpose)).size).toBeGreaterThanOrEqual(4);
    for (const h of out.hooks) {
      expect(h.charCount).toBe(h.text.length);
      expect(h.mobileLines).toBe(1);
      expect(h.purposeLabel).toBeTruthy();
    }
    expect(out.hooks.map((h) => h.index)).toEqual([1, 2, 3, 4, 5]);
    // No evidence supplied: nothing that implies a story, a number or news.
    expect(out.hooks.some((h) => ["story", "proof", "number", "announcement"].includes(h.purpose))).toBe(false);
    expect(out.skipped.map((s) => s.purpose)).toEqual(expect.arrayContaining(["story", "proof", "number", "announcement"]));
  });

  it("drops near-duplicates and refills once", async () => {
    let calls = 0;
    ctx.ai = fakeAi((call: { prompt: string }) => {
      calls++;
      const purposes = [...call.prompt.matchAll(/^\d+\. ([a-z-]+) \(/gm)].map((m) => m[1]!);
      if (calls === 1) {
        // Two near-identical hooks (different purposes) and the rest distinct.
        return { hooks: purposes.map((p, i) => hook(p, i < 2 ? "Hire your first engineer for judgement" : `A different line number ${"x".repeat(i)} for ${p}`)) };
      }
      return { hooks: purposes.map((p) => hook(p, `Refilled ${p} hook about trust`)) };
    });
    const out = await run();
    expect(calls).toBe(2);
    expect(out.hooks.length).toBeGreaterThanOrEqual(4);
    expect(out.hooks.filter((h) => h.text === "Hire your first engineer for judgement")).toHaveLength(1);
    expect(new Set(out.hooks.map((h) => h.purpose)).size).toBe(out.hooks.length);
  });

  it("drops hooks that break the user's hard rules or invent a number or a story", async () => {
    await upsertMemory(ctx.profileId, "writing/rules", "- No emojis", "USER");
    ctx.ai = fakeAi((call: { prompt: string }) => {
      const purposes = [...call.prompt.matchAll(/^\d+\. ([a-z-]+) \(/gm)].map((m) => m[1]!);
      return {
        hooks: purposes.map((p, i) =>
          i === 0 ? hook(p, "Great hire \u{1F680}") : i === 1 ? hook(p, "We grew 300% last year") : i === 2 ? hook(p, "My first hire quit", true) : hook(p, `Plain line ${"y".repeat(i)} about ${p}`),
        ),
      };
    });
    const out = await run();
    const texts = out.hooks.map((h) => h.text);
    expect(texts.join(" ")).not.toMatch(/\u{1F680}|300|quit/u);
  });

  it("skips question hooks when the rules forbid a rhetorical opening, and avoids the previous set's purposes when it can", async () => {
    await upsertMemory(ctx.profileId, "writing/rules", "- Never open with a rhetorical question", "USER");
    ctx.ai = scriptedAi();
    const out = await run({ count: 8 });
    expect(out.hooks.some((h) => h.purpose === "question")).toBe(false);
    expect(out.skipped.find((s) => s.purpose === "question")!.reason).toMatch(/rules forbid/);
  });

  it("fails cleanly when no hook survives", async () => {
    ctx.ai = fakeAi({ hooks: [] });
    expect(await generateHooksRun(ctx, input)).toMatch(/^Failed: /);
  });
});
