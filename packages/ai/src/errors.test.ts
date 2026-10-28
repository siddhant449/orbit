import { APICallError, generateText, RetryError, streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_UNAVAILABLE_USER_MESSAGE, aiErrorUserMessage, classifyAiError, describeAiError } from "./errors";
import { createAiClient } from "./client";
import { createEmbedder } from "./embed";
import { getModel } from "./provider";

const api = (statusCode: number | undefined, body?: unknown, message = "failed") =>
  new APICallError({ message, url: "https://api.openai.com/v1/responses", requestBodyValues: {}, statusCode, responseBody: body === undefined ? undefined : JSON.stringify(body), isRetryable: statusCode === 429 || (statusCode ?? 500) >= 500 });

const QUOTA_BODY = { error: { message: "You have no credits remaining. Check your plan and billing details.", type: "insufficient_quota", code: "insufficient_quota" } };
const RATE_BODY = { error: { message: "Rate limit reached for gpt in organization org-x on tokens per min.", type: "tokens", code: "rate_limit_exceeded" } };

describe("classifyAiError", () => {
  it("names a 429 with insufficient_quota as quota", () => {
    expect(classifyAiError(api(429, QUOTA_BODY))).toBe("quota");
  });
  it("names a quota message without a code as quota", () => {
    expect(classifyAiError(api(429, { error: { message: "You exceeded your current quota, please check your plan and billing details." } }))).toBe("quota");
  });
  it("names the rewritten 402 as quota", () => {
    expect(classifyAiError(api(402, QUOTA_BODY))).toBe("quota");
  });
  it("names 401 and invalid_api_key as auth", () => {
    expect(classifyAiError(api(401, { error: { message: "Incorrect API key provided", code: "invalid_api_key" } }))).toBe("auth");
  });
  it("names 5xx and network failures as outage", () => {
    expect(classifyAiError(api(503))).toBe("outage");
    expect(classifyAiError(api(500, { error: { message: "The server had an error" } }))).toBe("outage");
    expect(classifyAiError(api(undefined, undefined, "Cannot connect to API: fetch failed"))).toBe("outage");
    expect(classifyAiError(new TypeError("fetch failed"))).toBe("outage");
  });
  it("classifies Gemini's own errors the same way", () => {
    expect(classifyAiError(api(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for metric ... free_tier ... limit: 0" } }))).toBe("quota");
    expect(classifyAiError(api(503, { error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded." } }))).toBe("outage");
    expect(classifyAiError(api(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }))).toBe("auth");
    expect(classifyAiError(api(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "denied" } }))).toBe("auth");
  });
  it("names a plain 429 as rate_limit", () => {
    expect(classifyAiError(api(429, RATE_BODY))).toBe("rate_limit");
  });
  it("looks through RetryError and cause", () => {
    const retry = new RetryError({ message: "Failed after 3 attempts", reason: "maxRetriesExceeded", errors: [api(429, RATE_BODY), api(429, QUOTA_BODY)] });
    expect(classifyAiError(retry)).toBe("quota");
    expect(classifyAiError(new Error("wrapped", { cause: api(401) }))).toBe("auth");
  });
  it("leaves everything else alone", () => {
    expect(classifyAiError(api(400, { error: { message: "bad" } }))).toBe("other");
    expect(classifyAiError(new Error("boom"))).toBe("other");
    expect(classifyAiError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe("other");
    expect(classifyAiError(undefined)).toBe("other");
  });
  it("maps provider-down classes to the user message and nothing else", () => {
    expect(aiErrorUserMessage(api(429, QUOTA_BODY))).toBe(AI_UNAVAILABLE_USER_MESSAGE);
    expect(aiErrorUserMessage(api(401))).toBe(AI_UNAVAILABLE_USER_MESSAGE);
    expect(aiErrorUserMessage(api(502))).toBe(AI_UNAVAILABLE_USER_MESSAGE);
    expect(aiErrorUserMessage(api(429, RATE_BODY))).toBeNull();
    expect(aiErrorUserMessage(new Error("boom"))).toBeNull();
  });
  it("describes without provider text", () => {
    const d = describeAiError(api(429, QUOTA_BODY, "You have no credits remaining"));
    expect(d).toContain("quota");
    expect(d).not.toMatch(/credits|billing/i);
  });
});

describe("no retry on quota and auth", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const stub = (make: () => Response) => {
    const f = vi.fn(async () => make());
    vi.stubGlobal("fetch", f);
    return f;
  };

  it("sends exactly one request when OpenAI answers 429 insufficient_quota (text)", async () => {
    const f = stub(respond(429, QUOTA_BODY));
    await expect(createAiClient("sk-test").text({ model: "generate", system: "s", prompt: "p" })).rejects.toSatisfy((e) => classifyAiError(e) === "quota");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("sends exactly one request for json, embeddings and streamText", async () => {
    const f = stub(respond(429, QUOTA_BODY));
    await expect(createEmbedder("sk-test").embed(["x"])).rejects.toSatisfy((e) => classifyAiError(e) === "quota");
    expect(f).toHaveBeenCalledTimes(1);
    f.mockClear();
    let streamErr: unknown;
    const r = streamText({ model: getModel("generate", "sk-test"), messages: [{ role: "user", content: "hi" }], onError: ({ error }) => (streamErr = error) });
    await r.consumeStream({ onError: () => {} });
    expect(classifyAiError(streamErr)).toBe("quota");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("sends exactly one request on 401", async () => {
    const f = stub(respond(401, { error: { message: "Incorrect API key", code: "invalid_api_key" } }));
    await expect(generateText({ model: getModel("generate", "sk-bad"), prompt: "hi" })).rejects.toSatisfy((e) => classifyAiError(e) === "auth");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("still retries a plain rate limit and an outage", async () => {
    const f = stub(respond(429, RATE_BODY));
    await expect(generateText({ model: getModel("generate", "sk"), prompt: "hi", maxRetries: 1 })).rejects.toSatisfy((e) => classifyAiError(e) === "rate_limit");
    expect(f).toHaveBeenCalledTimes(2);
    const g = stub(respond(503, { error: { message: "down" } }));
    await expect(generateText({ model: getModel("generate", "sk"), prompt: "hi", maxRetries: 1 })).rejects.toSatisfy((e) => classifyAiError(e) === "outage");
    expect(g).toHaveBeenCalledTimes(2);
  });
});
