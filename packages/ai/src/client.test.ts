import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiUnavailableError, createClaudeClient } from "./client";

describe("createClaudeClient without a key", () => {
  it("constructs without throwing, then throws AiUnavailableError on use", async () => {
    const client = createClaudeClient("");
    await expect(client.text({ model: "extract", system: "s", prompt: "p" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    await expect(
      client.json({ model: "generate", system: "s", prompt: "p", schema: z.object({}) }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("createClaudeClient with a fake SDK", () => {
  type Msg = { stop_reason: string; content: { type: string; text?: string }[] };
  const reply = (text: string, stop_reason = "end_turn"): Msg => ({
    stop_reason,
    content: [{ type: "text", text }],
  });
  const make = (msg: Msg) => {
    const calls: Record<string, unknown>[] = [];
    const sdk = {
      messages: {
        create: async (p: Record<string, unknown>) => {
          calls.push(p);
          return msg;
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = createClaudeClient("key", (() => sdk) as any);
    return { client, calls };
  };
  const schema = z.object({ a: z.number() });

  it("sends output_config.format json_schema, model alias and images", async () => {
    const { client, calls } = make(reply('{"a":1}'));
    const out = await client.json({
      model: "extract",
      system: "sys",
      prompt: "p",
      schema,
      images: [{ mediaType: "image/png", base64: "AAA" }],
    });
    expect(out).toEqual({ a: 1 });
    const call = calls[0] as any;
    expect(call.model).toBe("claude-haiku-5-5");
    expect(call.system).toBe("sys");
    expect(call.output_config.format.type).toBe("json_schema");
    expect(call.output_config.format.schema.properties.a.type).toBe("number");
    expect(call.messages[0].content[0].type).toBe("image");
    expect(call.messages[0].content.at(-1)).toEqual({ type: "text", text: "p" });
  });

  it("uses the generate model for generate", async () => {
    const { client, calls } = make(reply("hi"));
    expect(await client.text({ model: "generate", system: "s", prompt: "p" })).toBe("hi");
    expect((calls[0] as any).model).toBe("claude-sonnet-5-5");
  });

  it("rejects schema-invalid JSON", async () => {
    const { client } = make(reply('{"a":"x"}'));
    await expect(client.json({ model: "extract", system: "s", prompt: "p", schema })).rejects.toThrow();
  });

  it("throws a clear error on non-JSON text", async () => {
    const { client } = make(reply("not json"));
    await expect(
      client.json({ model: "extract", system: "s", prompt: "p", schema }),
    ).rejects.toThrow("invalid JSON");
  });

  it("throws on refusal", async () => {
    const { client } = make(reply("", "refusal"));
    await expect(client.text({ model: "extract", system: "s", prompt: "p" })).rejects.toThrow(
      "declined",
    );
  });

  it("throws a clear error on max_tokens, not a SyntaxError", async () => {
    const { client } = make(reply('{"a":', "max_tokens"));
    const err = await client
      .json({ model: "extract", system: "s", prompt: "p", schema })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(err.message).toContain("max_tokens");
  });
});
