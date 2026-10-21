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
