import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiClient, type AiClient } from "./client";
import { fakeEmbedder } from "./testing";
import { AiBlockedError, assertAiAllowed, bindEmbedder, bindModerate, bindUsage, imageCostMicroUsd, reportUsage, setUsageGate, setUsageRecorder, type UsageEvent } from "./usage";

const SECRET_PROMPT = "my very private prompt text";
const SECRET_REPLY = "a private model reply";

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 500, text: 500, reasoning: undefined },
};
const model = (text = SECRET_REPLY) =>
  new MockLanguageModelV4({ modelId: "mock", doGenerate: { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] } });

let events: UsageEvent[];
beforeEach(() => {
  events = [];
  setUsageRecorder((e) => events.push(e));
});
afterEach(() => {
  setUsageRecorder(null);
  setUsageGate(null);
  vi.unstubAllEnvs();
});

const who = { userId: "u1", teamId: "t1", profileId: "p1", chatId: "c1" };

describe("bindUsage (the central ledger hook)", () => {
  it("records feature, model, provider token counts, estimated cost and who for a real client call", async () => {
    vi.stubEnv("AI_MODEL_GENERATE", "gpt-6-luna");
    const ai = bindUsage(createAiClient("key", { model: () => model() }), who);
    expect(await ai.text({ model: "generate", system: "sys", prompt: SECRET_PROMPT, feature: "hooks" })).toBe(SECRET_REPLY);
    expect(events).toHaveLength(1);
    // 1000 in x $0.3/M + 500 out x $1.2/M = 300 + 600 micro-USD
    expect(events[0]).toEqual({ ...who, feature: "hooks", model: "gpt-6-luna", inputTokens: 1000, outputTokens: 500, costMicroUsd: 900, ok: true });
  });

  it("never carries prompt or output text", async () => {
    const ai = bindUsage(createAiClient("key", { model: () => model() }), who);
    await ai.text({ model: "extract", system: "sys", prompt: SECRET_PROMPT });
    const json = JSON.stringify(events);
    expect(json).not.toContain(SECRET_PROMPT);
    expect(json).not.toContain(SECRET_REPLY);
  });

  it("uses the binding's default feature, and 'other' without one", async () => {
    const ai = bindUsage(createAiClient("key", { model: () => model() }), { ...who, feature: "strategy" });
    await ai.text({ model: "extract", system: "s", prompt: "p" });
    await ai.text({ model: "extract", system: "s", prompt: "p", feature: "title" });
    await bindUsage(createAiClient("key", { model: () => model() }), who).text({ model: "extract", system: "s", prompt: "p" });
    expect(events.map((e) => e.feature)).toEqual(["strategy", "title", "other"]);
  });

  it("records a failed call as ok=false with no tokens", async () => {
    const failing = new MockLanguageModelV4({ modelId: "mock", doGenerate: async () => { throw new Error("boom"); } });
    const ai = bindUsage(createAiClient("key", { model: () => failing }), who);
    await expect(ai.text({ model: "extract", system: "s", prompt: "p" })).rejects.toThrow();
    expect(events).toEqual([expect.objectContaining({ ok: false, inputTokens: 0, outputTokens: 0, costMicroUsd: 0 })]);
  });

  it("estimates tokens from lengths for a client that reports none (the scripted mock)", async () => {
    const scripted: AiClient = { text: async () => "x".repeat(40), json: async () => ({ a: 1 }) as never };
    const ai = bindUsage(scripted, { ...who, feature: "ideas" });
    await ai.text({ model: "generate", system: "a".repeat(40), prompt: "b".repeat(60) });
    expect(events[0]).toMatchObject({ feature: "ideas", inputTokens: 25, outputTokens: 10, ok: true });
  });

  it("refuses before any model call when the gate says the caller is blocked", async () => {
    setUsageGate(async () => {
      throw new AiBlockedError();
    });
    const m = model();
    const ai = bindUsage(createAiClient("key", { model: () => m }), who);
    await expect(ai.text({ model: "extract", system: "s", prompt: "p" })).rejects.toBeInstanceOf(AiBlockedError);
    expect(m.doGenerateCalls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("the price table honours AI_PRICE_* overrides", async () => {
    vi.stubEnv("AI_PRICE_GPT_6_LUNA", "10,20");
    const ai = bindUsage(createAiClient("key", { model: () => model() }), who);
    await ai.text({ model: "generate", system: "s", prompt: "p" });
    expect(events[0]!.costMicroUsd).toBe(1000 * 10 + 500 * 20);
  });
});

describe("other call kinds", () => {
  it("embeddings: one event per embed(), input tokens only, priced from the embedding model", async () => {
    const e = bindEmbedder(fakeEmbedder(), who, "text-embedding-3-small");
    await e.embed(["a".repeat(4000)]);
    expect(events[0]).toMatchObject({ ...who, feature: "embeddings", model: "text-embedding-3-small", inputTokens: 1000, outputTokens: 0, costMicroUsd: 20, ok: true });
  });

  it("moderation: counted, free", async () => {
    const m = bindModerate(async () => ({ flagged: false, categories: [] }), who);
    await m("hello there");
    expect(events[0]).toMatchObject({ feature: "moderation", costMicroUsd: 0, ok: true });
  });

  it("images: per-image price by quality, overridable", () => {
    expect(imageCostMicroUsd("low")).toBeLessThan(imageCostMicroUsd("medium"));
    expect(imageCostMicroUsd("medium")).toBe(42_000);
    expect(imageCostMicroUsd("high", { AI_IMAGE_PRICE_USD_HIGH: "0.2" })).toBe(200_000);
  });
});

describe("registry", () => {
  it("is a no-op without a recorder, and a throwing recorder never breaks the caller", () => {
    setUsageRecorder(null);
    expect(() => reportUsage({ feature: "chat", model: "m", inputTokens: 1, outputTokens: 1, ok: true })).not.toThrow();
    setUsageRecorder(() => {
      throw new Error("db down");
    });
    expect(() => reportUsage({ feature: "chat", model: "m", inputTokens: 1, outputTokens: 1, ok: true })).not.toThrow();
  });

  it("assertAiAllowed passes with no gate or no identity", async () => {
    await expect(assertAiAllowed({ userId: "u" })).resolves.toBeUndefined();
    setUsageGate(async () => {
      throw new AiBlockedError();
    });
    await expect(assertAiAllowed({})).resolves.toBeUndefined();
    await expect(assertAiAllowed({ userId: "u" })).rejects.toBeInstanceOf(AiBlockedError);
  });
});
