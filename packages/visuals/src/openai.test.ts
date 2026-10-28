import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { openAiImageProvider } from "./openai";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const okResult = (bytes = PNG) => ({ image: { uint8Array: new Uint8Array(bytes), mediaType: "image/png" }, images: [], warnings: [] });

function provider(gen: ReturnType<typeof vi.fn>, over = {}) {
  return openAiImageProvider({ apiKey: "sk-test", model: "gpt-image-2.5-flare", editModel: "gpt-image-2.5-sunburst", generate: gen as never, imageModel: (id) => ({ modelId: id }) as never, fallbackModel: null, ...over });
}
const call = (p = provider(vi.fn())) => p.generate({ prompt: "x", size: "1024x1536", quality: "medium" });

function apiError(statusCode: number, body: string, message = "boom") {
  return new APICallError({ message, url: "https://api.openai.com/v1/images/generations", requestBodyValues: {}, statusCode, responseBody: body });
}

describe("openai adapter", () => {
  it("generates with the generate model, size, quality and moderation auto, and returns the bytes", async () => {
    const gen = vi.fn(async (_arg: unknown) => okResult());
    const p = provider(gen);
    const out = await p.generate({ prompt: "a plant", size: "1024x1536", quality: "low" });
    expect(out.image.bytes.equals(PNG)).toBe(true);
    expect(out.image.mediaType).toBe("image/png");
    expect(p.id).toBe("openai:gpt-image-2.5-flare");
    const arg = gen.mock.calls[0]![0] as Record<string, any>;
    expect(arg.model).toEqual({ modelId: "gpt-image-2.5-flare" });
    expect(arg.prompt).toBe("a plant");
    expect(arg.size).toBe("1024x1536");
    expect(arg.maxRetries).toBe(0);
    expect(arg.providerOptions.openai).toMatchObject({ quality: "low", moderation: "auto" });
  });

  it("generation with references goes through the edit endpoint with the images", async () => {
    const gen = vi.fn(async (_arg: unknown) => okResult());
    await provider(gen).generate({ prompt: "p", size: "1024x1024", quality: "low", references: [{ bytes: PNG, mediaType: "image/png" }] });
    const arg = gen.mock.calls[0]![0] as Record<string, any>;
    expect(arg.prompt.text).toBe("p");
    expect(arg.prompt.images).toHaveLength(1);
  });

  it("edit uses the edit model, passes the image, and forwards the abort signal", async () => {
    const gen = vi.fn(async (_arg: unknown) => okResult());
    const ac = new AbortController();
    const p = provider(gen);
    await p.edit({ image: { bytes: PNG, mediaType: "image/png" }, prompt: "bigger", quality: "medium", abortSignal: ac.signal });
    const arg = gen.mock.calls[0]![0] as Record<string, any>;
    expect(arg.model).toEqual({ modelId: "gpt-image-2.5-sunburst" });
    expect(arg.prompt).toMatchObject({ text: "bigger" });
    expect(arg.abortSignal).toBe(ac.signal);
  });

  it("maps 403 verification, 400 moderation, timeout, 5xx, 429 and 401 to ProviderError codes", async () => {
    const cases: [unknown, string, boolean][] = [
      [apiError(403, '{"error":{"message":"Your organization must be verified to use the model `gpt-image-2`."}}'), "verification_required", false],
      [apiError(400, '{"error":{"code":"moderation_blocked","message":"Your request was rejected by the safety system."}}'), "refused", false],
      [apiError(400, '{"error":{"code":"content_policy_violation"}}'), "refused", false],
      [apiError(500, "{}"), "unavailable", true],
      [apiError(503, "{}"), "unavailable", true],
      [apiError(429, "{}"), "unavailable", true],
      [apiError(401, '{"error":{"message":"Incorrect API key provided: sk-test-SECRET"}}'), "unavailable", false],
      [apiError(429, '{"error":{"message":"You have no credits remaining","code":"insufficient_quota"}}'), "unavailable", false],
      [apiError(429, '{"error":{"message":"Rate limit reached","code":"rate_limit_exceeded"}}'), "unavailable", true],
      [Object.assign(new Error("aborted"), { name: "AbortError" }), "timeout", false],
      [Object.assign(new Error("timed out"), { name: "TimeoutError" }), "timeout", false],
      [new TypeError("fetch failed"), "unavailable", true],
    ];
    for (const [err, code, retryable] of cases) {
      const e = await call(provider(vi.fn(async () => { throw err; }))).catch((x) => x);
      expect(e, String(code)).toMatchObject({ name: "ProviderError", code, retryable });
    }
  });

  it("errors never contain the key or the provider's response body", async () => {
    const e = await call(provider(vi.fn(async () => { throw apiError(401, '{"error":{"message":"Incorrect API key provided: sk-test-SECRET"}}', "Incorrect API key sk-test-SECRET"); }))).catch((x) => x);
    expect(JSON.stringify({ m: e.message, c: e.code, s: String(e.stack) })).not.toMatch(/sk-test|SECRET/);
  });

  it("an empty or non-image result is bad_output", async () => {
    const e = await call(provider(vi.fn(async () => okResult(Buffer.alloc(0))))).catch((x) => x);
    expect(e).toMatchObject({ code: "bad_output", retryable: false });
  });

  describe("Gemini fallback", () => {
    const quota = () => apiError(429, '{"error":{"message":"no credits","code":"insufficient_quota"}}');
    const withFb = (gen: ReturnType<typeof vi.fn>) => provider(gen, { fallbackModel: () => ({ modelId: "gemini-3.1-flash-image" }) as never });

    it("quota on OpenAI: one Gemini image call, no OpenAI-only options, model recorded", async () => {
      const gen = vi.fn(async (arg: any) => { if (arg.model.modelId.startsWith("gpt")) throw quota(); return okResult(); });
      const out = await withFb(gen).generate({ prompt: "x", size: "1024x1536", quality: "medium" });
      expect(out.model).toBe("gemini-3.1-flash-image");
      expect(out.image.mediaType).toBe("image/png");
      expect(gen).toHaveBeenCalledTimes(2);
      const fbArg = gen.mock.calls[1]![0] as Record<string, any>;
      expect(fbArg.providerOptions).toBeUndefined();
      expect(fbArg.maxRetries).toBe(0);
    });
    it("Gemini failing too (free tier, limit 0): the usual unavailable error, no crash", async () => {
      const gen = vi.fn(async (arg: any) => { throw arg.model.modelId.startsWith("gpt") ? quota() : apiError(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"free_tier limit: 0"}}'); });
      const e = await withFb(gen).generate({ prompt: "x", size: "1024x1536", quality: "medium" }).catch((x) => x);
      expect(e).toMatchObject({ name: "ProviderError", code: "unavailable", retryable: false });
      expect(gen).toHaveBeenCalledTimes(2);
    });
    it("a plain rate limit or a refusal does not fall back; nor does a masked edit", async () => {
      const rate = vi.fn(async () => { throw apiError(429, '{"error":{"code":"rate_limit_exceeded"}}'); });
      await withFb(rate).generate({ prompt: "x", size: "1024x1536", quality: "medium" }).catch(() => {});
      expect(rate).toHaveBeenCalledTimes(1);
      const masked = vi.fn(async () => { throw quota(); });
      await withFb(masked).edit({ image: { bytes: PNG, mediaType: "image/png" }, mask: { bytes: PNG, mediaType: "image/png" }, prompt: "p", quality: "low" }).catch(() => {});
      expect(masked).toHaveBeenCalledTimes(1);
    });
  });
});
