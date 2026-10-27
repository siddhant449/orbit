import { getOrCreateChat, saveResearchBrief } from "@brandloop/db";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnContext } from "../context";
import { fakeResearchProvider } from "../mock";
import { cleanup, fakeAi, testContext } from "../test/fixtures";
import { researchTopicRun } from "./research";

const CHAT = "00000000-0000-4000-8000-00000000a901";
let ctx: TurnContext;
let searches: number;

beforeEach(async () => {
  await cleanup();
  ctx = await testContext({ chatId: CHAT, userText: "What happened in AI this week?" });
  await getOrCreateChat(ctx.profileId, ctx.userId, CHAT);
  const base = fakeResearchProvider();
  searches = 0;
  ctx.research.provider = { ...base, search: (q, s) => (searches++, base.search(q, s)) };
  // Wed 21 Oct 2026: the window is Mon 19 to Wed 21. Two items inside, one before it, one with an invented URL.
  ctx.ai = fakeAi(() => ({
    items: [
      { published: "2026-10-21", eventDate: null, claim: "Northwind shipped a model.", url: "https://northwind.example/models", publisher: "Northwind", role: "primary" },
      { published: "2026-10-20", eventDate: null, claim: "Harbor changed pricing.", url: "https://harbor.example/pricing", publisher: "Harbor", role: "primary" },
      { published: "2026-10-15", eventDate: null, claim: "Quill roundup.", url: "https://quill.example/old", publisher: "Quill", role: "corroboration" },
      { published: "2026-10-21", eventDate: null, claim: "Rumour.", url: "https://invented.example/x", publisher: "Unknown", role: "primary" },
    ],
  }));
});
afterAll(cleanup);

describe("researchTopic", () => {
  it("returns dated in-window items and an exclusion, drops the invented URL, and never widens the week", async () => {
    const out = await researchTopicRun(ctx, { query: "AI news", window: "this-month", site: null });
    if (typeof out === "string") throw new Error(out);
    expect(out.window).toMatchObject({ start: "2026-10-19", end: "2026-10-21" });
    expect(out.items.map((i) => i.url)).toEqual(["https://northwind.example/models", "https://harbor.example/pricing"]);
    expect(out.exclusions).toHaveLength(1);
    expect(out.items.every((i) => i.published && i.published >= "2026-10-19")).toBe(true);
    expect(searches).toBe(3);
    expect(ctx.research.brief?.items).toHaveLength(2);
  });

  it("reuses a fresh brief for the same chat, window and topic without searching again", async () => {
    await researchTopicRun(ctx, { query: "AI news", window: null, site: null });
    const again = await researchTopicRun(ctx, { query: "AI news", window: null, site: null });
    if (typeof again === "string") throw new Error(again);
    expect(again.reused).toBe(true);
    expect(searches).toBe(3);
  });

  it("refuses past the daily search cap and past two calls in one turn", async () => {
    await saveResearchBrief(ctx.profileId, CHAT, { topic: "earlier", windowStart: "2026-10-01", windowEnd: "2026-10-02", provider: "fake", items: [], exclusions: [], searchCount: 39 });
    expect(await researchTopicRun(ctx, { query: "AI news", window: null, site: null })).toMatch(/^Refused: today's research limit/);
    expect(searches).toBe(0);
    ctx.research.calls = 2;
    expect(await researchTopicRun(ctx, { query: "other", window: null, site: null })).toMatch(/^Refused: that is the most/);
  });

  it("refuses when web search is off and does not search", async () => {
    ctx.selections.webSearchEnabled = false;
    expect(await researchTopicRun(ctx, { query: "AI news", window: null, site: null })).toMatch(/^Refused: web search is off/);
    expect(searches).toBe(0);
  });
});


describe("research that cannot complete", () => {
  it("a provider that errors is skipped, not failed, and logs the real cause", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    ctx.research.provider = { id: "fake", search: async () => { throw Object.assign(new Error("upstream 503"), { statusCode: 503 }); } };
    const out = await researchTopicRun(ctx, { query: "AI news", window: null, site: null });
    expect(typeof out).toBe("string");
    expect(out as string).toMatch(/^Skipped:/);
    expect(out as string).toContain("write anyway");
    expect(log.mock.calls.flat().join(" ")).toContain("status 503");
    log.mockRestore();
  });
  it("a search that times out is skipped with the timeout reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    ctx.research.provider = { id: "fake", search: async () => { throw new DOMException("timed out", "TimeoutError"); } };
    const out = await researchTopicRun(ctx, { query: "AI news", window: null, site: null });
    expect(out as string).toMatch(/^Skipped: the web search took too long/);
    log.mockRestore();
  });
  it("has generous time budgets", async () => {
    const { SEARCH_TIMEOUT_MS, PREFETCH_WALL_MS } = await import("../research/brief");
    expect(SEARCH_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(PREFETCH_WALL_MS).toBeGreaterThanOrEqual(75_000);
    expect(PREFETCH_WALL_MS).toBeLessThan(120_000);
  });
});
