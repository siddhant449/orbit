import { upsertMemory } from "@brandloop/db";
import { createDocumentForChat, getOrCreateChat } from "@brandloop/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { TurnContext } from "../context";
import { cleanup, fakeAi, testContext } from "../test/fixtures";
import { analyzePostRun, type AnalysisOutput } from "./analyze";

let ctx: TurnContext;
beforeEach(async () => {
  await cleanup();
  ctx = await testContext({ chatId: "00000000-0000-4000-8000-000000000002" });
});
afterAll(cleanup);

const criteria = (over: Record<string, { rating: string; note: string }> = {}) =>
  ["hook", "fold-layout", "flow", "voice-rules", "accuracy", "audience-clarity"].map((id) => ({ id, rating: "strong", note: `model note ${id}`, ...over[id] }));
const model = (over: { issues?: unknown[]; optional?: string[]; criteria?: unknown[] } = {}) => ({ criteria: over.criteria ?? criteria(), issues: over.issues ?? [], optional: over.optional ?? [] });

const POST = "Stop building the wrong thing.\n\nWe shipped in a week — then waited.\n\nPick the harder question first.";
const run = async (postContent: string | null = POST) => (await analyzePostRun(ctx, { postContent })) as AnalysisOutput;

describe("analyzePost", () => {
  it("ranks a seeded hard violation first, quoting its line", async () => {
    await upsertMemory(ctx.profileId, "writing/rules", "- Don't use em dashes", "USER");
    ctx.ai = fakeAi(model({ issues: [{ quote: "Pick the harder question first.", problem: "The close is abrupt", rewrite: "Pick the harder question first, then ship.", impact: "clarity" }] }));
    const out = await run();
    expect(out.topFixes[0]).toMatchObject({ impact: "rule", quote: "We shipped in a week — then waited." });
    expect(out.topFixes[0]!.rewrite).toBe("We shipped in a week, then waited.");
    expect(out.topFixes.length).toBeLessThanOrEqual(3);
  });

  it("never lets a nit into the top three: it goes to optional", async () => {
    ctx.ai = fakeAi(model({ issues: [{ quote: "Stop building the wrong thing.", problem: "Could use a comma", rewrite: "Stop, building the wrong thing.", impact: "nit" }], optional: ["Consider a warmer close"] }));
    const out = await run();
    expect(out.topFixes.map((f) => f.problem)).not.toContain("Could use a comma");
    expect(out.optional).toEqual(["Could use a comma", "Consider a warmer close"]);
  });

  it("drops a model issue whose quote is not in the post", async () => {
    ctx.ai = fakeAi(model({ issues: [{ quote: "A line that is not there", problem: "Invented", rewrite: "x", impact: "accuracy" }] }));
    expect((await run()).topFixes).toEqual([]);
  });

  it("rates fold-layout and voice-rules in code even when the model disagrees", async () => {
    await upsertMemory(ctx.profileId, "writing/rules", "- Don't use em dashes", "USER");
    ctx.ai = fakeAi(model({ criteria: criteria({ "voice-rules": { rating: "strong", note: "all good" }, "fold-layout": { rating: "needs-work", note: "bad" } }) }));
    const out = await run();
    const by = Object.fromEntries(out.criteria.map((c) => [c.id, c]));
    expect(by["voice-rules"]).toMatchObject({ rating: "needs-work" });
    expect(by["voice-rules"]!.note).toMatch(/dash/i);
    expect(by["fold-layout"]!.rating).not.toBe("needs-work");
    expect(out.criteria.map((c) => c.id)).toEqual(["hook", "fold-layout", "flow", "voice-rules", "accuracy", "audience-clarity"]);
    expect(out.checks.find((c) => c.id === "dashes")).toMatchObject({ passed: false });
  });

  it("pasted text wins over the open post, and the source says which was analysed", async () => {
    await getOrCreateChat(ctx.profileId, ctx.userId, ctx.chatId);
    const doc = await createDocumentForChat(ctx.profileId, ctx.chatId, { title: "Open", text: "The open post text." });
    ctx.documentRef.current = doc;
    const ai = fakeAi(model());
    ctx.ai = ai;
    expect((await run("A pasted draft.\n\nSecond block.")).source).toBe("pasted");
    expect(ai.calls[0]!.prompt).toContain("A pasted draft.");
    expect(ai.calls[0]!.prompt).not.toContain("The open post text.");
    expect((await run(null)).source).toBe("open-post");
    expect(ai.calls[1]!.prompt).toContain("The open post text.");
  });

  it("fails clearly with no post at all", async () => {
    ctx.ai = fakeAi(model());
    expect(await analyzePostRun(ctx, { postContent: null })).toMatch(/^Failed: /);
  });
});
