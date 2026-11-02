import { APICallError, generateText, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiClient } from "./client";
import { fallbackModelOf, withFallback, withGeminiFallback } from "./fallback";
import { geminiEnabled, getGeminiModel, resolveGeminiImageModel, resolveGeminiModel } from "./gemini";
import { getProviderAlert } from "./provider-alert";
import { bindUsage, setUsageRecorder, type UsageEvent } from "./usage";

const apiErr = (status: number, body: unknown = {}) =>
  new APICallError({ message: "provider said no", url: "u", requestBodyValues: {}, statusCode: status, responseBody: JSON.stringify(body), isRetryable: status >= 500 });
const quota = () => apiErr(402, { error: { code: "insufficient_quota", message: "no credits" } });
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } } as never;

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });
const streamOf = (text: string) => ({
  stream: simulateReadableStream({
    chunks: [
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "t" },
      { type: "text-delta" as const, id: "t", delta: text },
      { type: "text-end" as const, id: "t" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage },
    ],
  }),
});
const failing = (err: unknown) => new MockLanguageModelV4({ modelId: "gpt-6-luna", doGenerate: async () => { throw err; }, doStream: async () => { throw err; } });
const good = (text: string, id = "gemini-3.5-flash") => new MockLanguageModelV4({ modelId: id, doGenerate: async () => textResult(text), doStream: async () => streamOf(text) });

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.restoreAllMocks();
  setUsageRecorder(null);
});

describe("withFallback", () => {
  it("quota on the primary: one Gemini call, result returned", async () => {
    const primary = failing(quota());
    const fb = good("from gemini");
    const model = withFallback(primary, () => fb);
    const res = await generateText({ model, prompt: "hi" });
    expect(res.text).toBe("from gemini");
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(fb.doGenerateCalls).toHaveLength(1);
    expect(fallbackModelOf(res.providerMetadata)).toBe("gemini-3.5-flash");
  });
  it("auth and outage fall back too", async () => {
    for (const err of [apiErr(401, { error: { code: "invalid_api_key" } }), apiErr(503)]) {
      const fb = good("ok");
      expect((await generateText({ model: withFallback(failing(err), () => fb), prompt: "hi" })).text).toBe("ok");
      expect(fb.doGenerateCalls).toHaveLength(1);
    }
  });
  it("a plain rate limit does not fall back", async () => {
    const fb = good("never");
    const model = withFallback(failing(apiErr(429, { error: { code: "rate_limit_exceeded" } })), () => fb);
    await expect(generateText({ model, prompt: "hi", maxRetries: 0 })).rejects.toThrow();
    expect(fb.doGenerateCalls).toHaveLength(0);
  });
  it("other errors do not fall back", async () => {
    const fb = good("never");
    await expect(generateText({ model: withFallback(failing(apiErr(400)), () => fb), prompt: "hi", maxRetries: 0 })).rejects.toThrow();
    expect(fb.doGenerateCalls).toHaveLength(0);
  });
  it("Gemini failing too: the original error surfaces, once, without retrying Gemini", async () => {
    const fb = failing(apiErr(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "free_tier limit: 0" } }));
    const err = await generateText({ model: withFallback(failing(quota()), () => fb), prompt: "hi" }).catch((e) => e);
    expect(err).toBeInstanceOf(APICallError);
    expect(err.statusCode).toBe(402);
    expect(fb.doGenerateCalls).toHaveLength(1);
  });
  it("Gemini briefly overloaded: retried after a short wait, then answers", async () => {
    let calls = 0;
    const fb = new MockLanguageModelV4({
      modelId: "gemini-3.5-flash",
      doGenerate: async () => {
        if (calls++ === 0) throw apiErr(503);
        return textResult("second try");
      },
    });
    const res = await generateText({ model: withFallback(failing(quota()), () => fb, { retryDelaysMs: [0, 0] }), prompt: "hi" });
    expect(res.text).toBe("second try");
    expect(calls).toBe(2);
  });
  it("Gemini overloaded every time: a bounded number of tries, then the original error", async () => {
    const fb = failing(apiErr(503));
    const err = await generateText({ model: withFallback(failing(quota()), () => fb, { retryDelaysMs: [0, 0] }), prompt: "hi" }).catch((e) => e);
    expect(err.statusCode).toBe(402);
    expect(fb.doGenerateCalls).toHaveLength(3);
  });
  it("Gemini per-minute limit: waits the delay it asks for (capped), then answers", async () => {
    let calls = 0;
    const busy = apiErr(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota", details: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }, { retryDelay: "33s" }] } });
    const fb = new MockLanguageModelV4({
      modelId: "gemini-3.5-flash",
      doGenerate: async () => {
        if (calls++ === 0) throw busy;
        return textResult("after the wait");
      },
    });
    const t0 = Date.now();
    const res = await generateText({ model: withFallback(failing(quota()), () => fb, { retryDelaysMs: [0, 0], maxWaitMs: 20 }), prompt: "hi" });
    expect(res.text).toBe("after the wait");
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
  it("no fallback model: the primary error surfaces", async () => {
    await expect(generateText({ model: withFallback(failing(quota()), () => null), prompt: "hi" })).rejects.toBeInstanceOf(APICallError);
  });
  it("streams: a primary that fails before any output is answered by the fallback", async () => {
    const fb = good("streamed from gemini");
    const r = streamText({ model: withFallback(failing(quota()), () => fb), prompt: "hi" });
    expect(await r.text).toBe("streamed from gemini");
    expect(fb.doStreamCalls).toHaveLength(1);
  });
  it("streams: an error part before any output also falls back", async () => {
    const primary = new MockLanguageModelV4({
      modelId: "gpt-6-luna",
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [{ type: "stream-start" as const, warnings: [] }, { type: "error" as const, error: quota() }] }) }),
    });
    const fb = good("recovered");
    expect(await streamText({ model: withFallback(primary, () => fb), prompt: "hi" }).text).toBe("recovered");
  });
  it("streams: a failure after output is kept (no fallback)", async () => {
    const primary = new MockLanguageModelV4({
      modelId: "gpt-6-luna",
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [{ type: "stream-start" as const, warnings: [] }, { type: "text-start" as const, id: "t" }, { type: "text-delta" as const, id: "t", delta: "partial" }, { type: "error" as const, error: quota() }],
        }),
      }),
    });
    const fb = good("never");
    let seen: unknown;
    const r = streamText({ model: withFallback(primary, () => fb), prompt: "hi", onError: ({ error }) => (seen = error) });
    await r.consumeStream({ onError: () => {} });
    expect(seen).toBeInstanceOf(APICallError);
    expect(fb.doStreamCalls).toHaveLength(0);
  });
  it("records the failure and the fallback in the admin alert", async () => {
    // Under vitest the default counter store is one shared in-memory store; the alert reads it back.
    await generateText({ model: withFallback(failing(quota()), () => good("ok")), prompt: "hi" });
    await new Promise((r) => setTimeout(r, 5));
    const alert = await getProviderAlert();
    expect(alert).toMatchObject({ cls: "quota" });
    expect(alert?.fallbackAt).toBeTypeOf("number");
  });
});

describe("Gemini config", () => {
  it("is off without GEMINI_API_KEY and leaves the model untouched", () => {
    const m = failing(quota());
    expect(geminiEnabled({})).toBe(false);
    expect(getGeminiModel("write", {})).toBeNull();
    expect(withGeminiFallback(m, "write", {})).toBe(m);
  });
  it("wraps when keyed, with configurable models", () => {
    const env = { GEMINI_API_KEY: "g-test" };
    const m = failing(quota());
    expect(withGeminiFallback(m, "write", env)).not.toBe(m);
    expect(resolveGeminiModel("write", env)).toBe("gemini-3.5-flash");
    expect(resolveGeminiModel("write", { ...env, GEMINI_MODEL_WRITE: "gemini-3.1-pro-preview" })).toBe("gemini-3.1-pro-preview");
    expect(resolveGeminiModel("extract", { ...env, GEMINI_MODEL_EXTRACT: "x" })).toBe("x");
    expect(resolveGeminiImageModel(env)).toBe("gemini-3.1-flash-image");
    expect((getGeminiModel("generate", env) as { modelId: string }).modelId).toBe("gemini-3.5-flash");
  });
});

describe("ledger", () => {
  it("records the Gemini model that actually answered", async () => {
    const events: UsageEvent[] = [];
    setUsageRecorder((e) => events.push(e));
    const ai = bindUsage(createAiClient("sk", { model: () => withFallback(failing(quota()), () => good("hello", "gemini-3.5-flash")) }), { userId: "u1", feature: "ideas" });
    expect(await ai.text({ model: "write", system: "s", prompt: "p" })).toBe("hello");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ ok: true, model: "gemini-3.5-flash", feature: "ideas" });
  });
});
