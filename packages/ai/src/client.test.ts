import { APICallError, NoObjectGeneratedError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AiUnavailableError,
  createAiClient,
  createClaudeClient,
  resolveModel,
  type ModelAlias,
} from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
});

type FinishUnified = "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** A scripted model: one canned reply for every call. */
function mockModel(text: string, finish: FinishUnified = "stop", modelId = "mock") {
  return new MockLanguageModelV4({
    modelId,
    doGenerate: {
      content: text ? [{ type: "text", text }] : [],
      finishReason: { unified: finish, raw: finish },
      usage,
      warnings: [],
    },
  });
}

/** Builds a client whose model factory records the alias it was asked for. */
function make(text: string, finish: FinishUnified = "stop") {
  const aliases: ModelAlias[] = [];
  const model = mockModel(text, finish);
  const client = createAiClient("key", {
    model: (alias) => {
      aliases.push(alias);
      return model;
    },
  });
  return { client, model, aliases };
}

const schema = z.object({ a: z.number() });
const base = { system: "sys", prompt: "p" } as const;

/** What OpenAI's Responses API returns for a structured-output refusal. */
const REFUSAL_BODY = JSON.stringify({
  id: "resp_1",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "refusal", refusal: "I'm sorry, I can't help with that." }],
    },
  ],
});

/** A client whose model throws the error the AI SDK raises when a provider call fails. */
function makeFailing(responseBody: string | undefined, statusCode = 200) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new APICallError({
        message: "Invalid JSON response",
        url: "https://api.openai.com/v1/responses",
        requestBodyValues: {},
        statusCode,
        responseBody,
      });
    },
  });
  return createAiClient("key", { model: () => model });
}

describe("createAiClient without a key", () => {
  it("constructs without throwing, then throws AiUnavailableError on use", async () => {
    const factory = vi.fn(() => mockModel("{}"));
    const client = createAiClient("", { model: factory });
    await expect(client.text({ model: "extract", ...base })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    await expect(
      client.json({ model: "generate", ...base, schema: z.object({}) }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(factory).not.toHaveBeenCalled();
  });

  it("names OPENAI_API_KEY in the default message", () => {
    expect(new AiUnavailableError().message).toBe(
      "AI is unavailable: OPENAI_API_KEY is not set.",
    );
  });

  it("reads OPENAI_API_KEY from the environment by default", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const client = createAiClient();
    await expect(client.text({ model: "extract", ...base })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("keeps createClaudeClient as a deprecated alias", () => {
    expect(createClaudeClient).toBe(createAiClient);
  });
});

describe("createAiClient json()", () => {
  it("returns the parsed object and uses the requested model alias", async () => {
    const { client, aliases } = make('{"a":1}');
    const out = await client.json({ model: "extract", ...base, schema });
    expect(out).toEqual({ a: 1 });
    expect(aliases).toEqual(["extract"]);
  });

  it("sends the system prompt, the user prompt and a JSON schema response format", async () => {
    const { client, model } = make('{"a":1}');
    await client.json({ model: "generate", system: "be terse", prompt: "go", schema });
    const call = model.doGenerateCalls[0]!;
    expect(call.responseFormat?.type).toBe("json");
    expect((call.responseFormat as { schema?: { properties?: Record<string, { type?: string }> } }).schema?.properties?.a?.type).toBe("number");
    expect(call.prompt[0]).toMatchObject({ role: "system", content: "be terse" });
    const user = call.prompt.at(-1)!;
    expect(user.role).toBe("user");
    expect(JSON.stringify(user.content)).toContain("go");
  });

  it("rejects schema-invalid model output with the AI SDK NoObjectGeneratedError", async () => {
    const { client } = make('{"a":"x"}');
    const err = await client.json({ model: "extract", ...base, schema }).catch((e) => e);
    expect(NoObjectGeneratedError.isInstance(err)).toBe(true);
    expect(err.message).toContain("did not match schema");
  });

  it("rejects output that is not JSON with the AI SDK NoObjectGeneratedError", async () => {
    const { client } = make("not json");
    const err = await client.json({ model: "extract", ...base, schema }).catch((e) => e);
    expect(NoObjectGeneratedError.isInstance(err)).toBe(true);
    expect(err).not.toBeInstanceOf(SyntaxError);
  });

  it("throws a 'declined' error on a content-filter refusal", async () => {
    const { client } = make("", "content-filter");
    await expect(client.json({ model: "extract", ...base, schema })).rejects.toThrow("declined");
  });

  it("throws 'declined' on a content-filter stop even when some text came back", async () => {
    // Unparseable partial text: the parser fails, the real cause is still the filter.
    const partial = make("I can't", "content-filter");
    await expect(
      partial.client.json({ model: "extract", ...base, schema }),
    ).rejects.toThrow("declined");
    // Perfectly valid JSON: it parses, but a filtered reply must still not be returned.
    const valid = make('{"a":1}', "content-filter");
    await expect(valid.client.json({ model: "extract", ...base, schema })).rejects.toThrow(
      "declined",
    );
  });

  it("maps an OpenAI refusal content part (Invalid JSON response) to 'declined'", async () => {
    const client = makeFailing(REFUSAL_BODY);
    const err = await client.json({ model: "extract", ...base, schema }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(APICallError.isInstance(err)).toBe(false);
    expect(err.message).toContain("declined");
    // The original provider error stays reachable for debugging.
    expect(APICallError.isInstance(err.cause)).toBe(true);
  });

  it("matches the refusal part regardless of JSON spacing", async () => {
    const client = makeFailing('{"output":[{"content":[{ "type" :  "refusal", "refusal":"no"}]}]}');
    await expect(client.json({ model: "extract", ...base, schema })).rejects.toThrow("declined");
  });

  it("leaves other provider errors untouched", async () => {
    const client = makeFailing('{"error":{"message":"Incorrect API key provided"}}', 401);
    const err = await client.json({ model: "extract", ...base, schema }).catch((e) => e);
    expect(APICallError.isInstance(err)).toBe(true);
    expect(err.statusCode).toBe(401);
    expect(err.message).not.toContain("declined");
  });

  it("throws a clear output-limit error when truncated, never a SyntaxError", async () => {
    const { client } = make('{"a":', "length");
    const err = await client.json({ model: "extract", ...base, schema }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(err.message).toContain("output limit");
  });

  it("throws the output-limit error even when nothing was generated before the cut-off", async () => {
    const { client } = make("", "length");
    const err = await client.json({ model: "extract", ...base, schema }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("output limit");
  });
});

describe("createAiClient text()", () => {
  it("uses the generate model and returns the trimmed text", async () => {
    const { client, aliases } = make("  hi there \n");
    expect(await client.text({ model: "generate", ...base })).toBe("hi there");
    expect(aliases).toEqual(["generate"]);
  });

  it("throws a 'declined' error on a content-filter refusal", async () => {
    const { client } = make("", "content-filter");
    await expect(client.text({ model: "extract", ...base })).rejects.toThrow("declined");
  });

  it("throws 'declined' on a content-filter stop even when some text came back", async () => {
    const { client } = make("I can't help with", "content-filter");
    await expect(client.text({ model: "extract", ...base })).rejects.toThrow("declined");
  });

  it("maps an OpenAI refusal content part (Invalid JSON response) to 'declined'", async () => {
    const client = makeFailing(REFUSAL_BODY);
    const err = await client.text({ model: "extract", ...base }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(APICallError.isInstance(err)).toBe(false);
    expect(err.message).toContain("declined");
  });

  it("leaves other provider errors untouched", async () => {
    // 401 is not retryable, so the SDK surfaces it immediately.
    const client = makeFailing(undefined, 401);
    const err = await client.text({ model: "extract", ...base }).catch((e) => e);
    expect(APICallError.isInstance(err)).toBe(true);
    expect(err.statusCode).toBe(401);
    expect(err.message).not.toContain("declined");
  });

  it("throws the output-limit error when truncated", async () => {
    const { client } = make("partial", "length");
    await expect(client.text({ model: "extract", ...base })).rejects.toThrow("output limit");
  });
});

describe("createAiClient images", () => {
  it("forwards each image with its media type, before the text prompt", async () => {
    const { client, model } = make('{"a":1}');
    await client.json({
      model: "extract",
      system: "sys",
      prompt: "describe",
      schema,
      images: [
        { mediaType: "image/png", base64: "AAAA" },
        { mediaType: "image/jpeg", base64: "BBBB" },
      ],
    });
    const user = model.doGenerateCalls[0]!.prompt.at(-1)!;
    expect(user.role).toBe("user");
    const parts = user.content as { type: string; mediaType?: string; text?: string }[];
    const files = parts.filter((p) => p.type === "file");
    expect(files.map((f) => f.mediaType)).toEqual(["image/png", "image/jpeg"]);
    expect(parts.at(-1)).toMatchObject({ type: "text", text: "describe" });
  });

  it("forwards images through text() too", async () => {
    const { client, model } = make("a cat");
    await client.text({
      model: "extract",
      ...base,
      images: [{ mediaType: "image/webp", base64: "CCCC" }],
    });
    const parts = model.doGenerateCalls[0]!.prompt.at(-1)!.content as { type: string; mediaType?: string }[];
    expect(parts.find((p) => p.type === "file")?.mediaType).toBe("image/webp");
  });
});

describe("createAiClient abortSignal", () => {
  it("passes the caller's abort signal to the model for json() and text()", async () => {
    const { client, model } = make('{"a":1}');
    const controller = new AbortController();
    await client.json({ ...base, model: "generate", schema, abortSignal: controller.signal });
    await client.text({ ...base, model: "extract", abortSignal: controller.signal });
    expect(model.doGenerateCalls).toHaveLength(2);
    for (const call of model.doGenerateCalls) {
      expect(call.abortSignal).toBeDefined();
      controller.signal.aborted || expect(call.abortSignal!.aborted).toBe(false);
    }
    controller.abort();
    expect(model.doGenerateCalls.every((c) => c.abortSignal!.aborted)).toBe(true);
  });

  it("rejects with an AbortError when aborted mid-call", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: (opts) =>
        new Promise((_, reject) =>
          opts.abortSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        ),
    });
    const client = createAiClient("key", { model: () => model });
    const controller = new AbortController();
    const pending = client.json({ ...base, model: "generate", schema, abortSignal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("resolveModel", () => {
  it("has OpenAI defaults", () => {
    vi.stubEnv("AI_MODEL_GENERATE", undefined);
    vi.stubEnv("AI_MODEL_EXTRACT", undefined);
    expect(resolveModel("generate")).toBe("gpt-6.1-sol");
    expect(resolveModel("extract")).toBe("gpt-6-luna");
  });

  it("honours the AI_MODEL_* overrides", () => {
    vi.stubEnv("AI_MODEL_GENERATE", "custom-generate");
    vi.stubEnv("AI_MODEL_EXTRACT", "custom-extract");
    expect(resolveModel("generate")).toBe("custom-generate");
    expect(resolveModel("extract")).toBe("custom-extract");
  });
});
