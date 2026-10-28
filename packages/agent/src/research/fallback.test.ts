import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { openaiResearch } from "./provider";

const quota = () => new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 402, responseBody: JSON.stringify({ error: { code: "insufficient_quota" } }), isRetryable: false });
const usage = { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } } as never;
const window = { start: "2026-10-20", end: "2026-10-27" } as never;
const signal = () => new AbortController().signal;
const tool = { type: "provider", id: "x.tool" } as never;

describe("research fallback", () => {
  it("falls back to Gemini grounding once and keeps only provider-returned URLs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const primary = new MockLanguageModelV4({ modelId: "gpt-6-luna", doGenerate: async () => { throw quota(); } });
    const gemini = new MockLanguageModelV4({
      modelId: "gemini-3.5-flash",
      doGenerate: async () => ({
        content: [
          { type: "text" as const, text: "Answer mentioning https://invented.example/not-returned" },
          { type: "source" as const, sourceType: "url" as const, id: "s1", url: "https://news.example/a", title: "A" },
        ],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
      }),
    });
    const r = openaiResearch(primary, tool, { model: gemini, tool });
    const out = await r.search({ query: "q", window, maxResults: 8 }, signal());
    expect(out.citations.map((c) => c.url)).toEqual(["https://news.example/a"]);
    expect(out.model).toBe("gemini-3.5-flash");
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(gemini.doGenerateCalls).toHaveLength(1);
  });
  it("without a fallback, or when Gemini fails too, the original error surfaces", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const primary = new MockLanguageModelV4({ modelId: "gpt-6-luna", doGenerate: async () => { throw quota(); } });
    await expect(openaiResearch(primary, tool).search({ query: "q", window, maxResults: 8 }, signal())).rejects.toBeInstanceOf(APICallError);
    const gemini = new MockLanguageModelV4({ modelId: "g", doGenerate: async () => { throw new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 503 }); } });
    const err = await openaiResearch(primary, tool, { model: gemini, tool }).search({ query: "q", window, maxResults: 8 }, signal()).catch((e) => e);
    expect(err.statusCode).toBe(402);
    expect(gemini.doGenerateCalls).toHaveLength(1);
  });
  it("a rate limit does not fall back", async () => {
    const primary = new MockLanguageModelV4({ modelId: "p", doGenerate: async () => { throw new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 429, responseBody: JSON.stringify({ error: { code: "rate_limit_exceeded" } }) }); } });
    const gemini = new MockLanguageModelV4({ modelId: "g" });
    await expect(openaiResearch(primary, tool, { model: gemini, tool }).search({ query: "q", window, maxResults: 8 }, signal())).rejects.toBeDefined();
    expect(gemini.doGenerateCalls).toHaveLength(0);
  });
});
