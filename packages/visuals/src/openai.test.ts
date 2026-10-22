import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { openAiImageProvider } from "./openai";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const okResult = (bytes = PNG) => ({ image: { uint8Array: new Uint8Array(bytes), mediaType: "image/png" }, images: [], warnings: [] });

function provider(gen: ReturnType<typeof vi.fn>, over = {}) {
  return openAiImageProvider({ apiKey: "sk-test", model: "gpt-image-2.5-flare", editModel: "gpt-image-2.5-sunburst", generate: gen as never, imageModel: (id) => ({ modelId: id }) as never, ...over });
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
});
