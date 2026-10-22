import { describe, expect, it, vi } from "vitest";
import { createModerator } from "./moderation";
import { createUsageLimiter, estimateCostMicroUsd, memoryStore, upstashStore } from "./usage-limits";

describe("usage limiter", () => {
  it("allows 20 turns per window and denies the 21st with a wait", async () => {
    let t = Date.parse("2026-10-22T10:00:00Z");
    const lim = createUsageLimiter({ store: memoryStore(() => t), now: () => t });
    for (let i = 0; i < 20; i++) expect((await lim.take("chat", "p1", { limit: 20, windowSec: 600 })).ok).toBe(true);
    const denied = await lim.take("chat", "p1", { limit: 20, windowSec: 600 });
    expect(denied).toMatchObject({ ok: false, kind: "rate" });
    expect((denied as { retryAfterSec: number }).retryAfterSec).toBeLessThanOrEqual(600);
    expect((await lim.take("chat", "p2", { limit: 20, windowSec: 600 })).ok).toBe(true);
    t += 600_000;
    expect((await lim.take("chat", "p1", { limit: 20, windowSec: 600 })).ok).toBe(true);
  });

  it("stops at the daily cost cap and resets at UTC midnight", async () => {
    let t = Date.parse("2026-10-22T23:00:00Z");
    const lim = createUsageLimiter({ store: memoryStore(() => t), now: () => t });
    expect((await lim.checkBudget("chat", "p", 1_000)).ok).toBe(true);
    await lim.recordCost("chat", "p", 1_000);
    expect(await lim.checkBudget("chat", "p", 1_000)).toMatchObject({ ok: false, kind: "daily" });
    t = Date.parse("2026-10-23T00:00:01Z");
    expect((await lim.checkBudget("chat", "p", 1_000)).ok).toBe(true);
  });

  it("fails open and logs when the store throws", async () => {
    const onError = vi.fn();
    const store = { incr: async () => Promise.reject(new Error("down")), get: async () => Promise.reject(new Error("down")) };
    const lim = createUsageLimiter({ store, onError });
    expect((await lim.take("chat", "p", { limit: 1, windowSec: 60 })).ok).toBe(true);
    expect((await lim.checkBudget("chat", "p", 1)).ok).toBe(true);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("takeDaily counts operations per id per UTC day", async () => {
    const t = Date.parse("2026-10-22T10:00:00Z");
    const lim = createUsageLimiter({ store: memoryStore(() => t), now: () => t });
    expect((await lim.takeDaily("img", "team", 2)).ok).toBe(true);
    expect((await lim.takeDaily("img", "team", 2)).ok).toBe(true);
    expect((await lim.takeDaily("img", "team", 2)).ok).toBe(false);
  });

  it("the Upstash store speaks the REST pipeline", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [{ result: 3 }, { result: 1 }] }));
    const store = upstashStore({ url: "https://x.upstash.io/", token: "tok", fetchImpl });
    expect(await store.incr("k", 1, 60)).toBe(3);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://x.upstash.io/pipeline");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual([["INCRBY", "k", 1], ["EXPIRE", "k", 60, "NX"]]);
  });

  it("estimates cost from tokens and honours an override", () => {
    expect(estimateCostMicroUsd("gpt-6-luna", { inputTokens: 1000, outputTokens: 1000 }, {})).toBeCloseTo(1500);
    expect(estimateCostMicroUsd("gpt-6-luna", { inputTokens: 1000 }, { AI_PRICE_GPT_6_LUNA: "1,2" })).toBe(1000);
  });
});

describe("moderation client", () => {
  const ok = (body: unknown) => (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
  it("returns flagged categories", async () => {
    const m = createModerator({ apiKey: "k", fetchImpl: ok({ results: [{ flagged: true, categories: { hate: true, violence: false } }] }) });
    expect(await m("x")).toEqual({ flagged: true, categories: ["hate"] });
  });
  it("fails open on an HTTP error, a throw or a missing key", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await createModerator({ apiKey: "k", fetchImpl: (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch })("x")).flagged).toBe(false);
    expect((await createModerator({ apiKey: "k", fetchImpl: (async () => Promise.reject(new Error("net"))) as unknown as typeof fetch })("x")).flagged).toBe(false);
    expect((await createModerator({ apiKey: "" })("x")).flagged).toBe(false);
    expect(err).toHaveBeenCalledTimes(3);
    err.mockRestore();
  });
});
