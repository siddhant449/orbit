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

  it("rejects schema-invalid model output", async () => {
    const { client } = make('{"a":"x"}');
    await expect(client.json({ model: "extract", ...base, schema })).rejects.toThrow();
  });

  it("rejects output that is not JSON", async () => {
    const { client } = make("not json");
    await expect(client.json({ model: "extract", ...base, schema })).rejects.toThrow();
  });

  it("throws a 'declined' error on a content-filter refusal", async () => {
    const { client } = make("", "content-filter");
    await expect(client.json({ model: "extract", ...base, schema })).rejects.toThrow("declined");
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
