import { describe, expect, it } from "vitest";
import { createImageProvider } from "./provider";

describe("createImageProvider", () => {
  it("uses OpenAI whenever a key exists, in dev too; the mock only when asked for or with no key outside production", () => {
    expect(createImageProvider({ NODE_ENV: "development", OPENAI_API_KEY: "sk" }).id).toBe("openai:gpt-image-2.5-flare");
    expect(createImageProvider({ NODE_ENV: "development", OPENAI_API_KEY: "sk", VISUALS_PROVIDER: "mock" }).id).toBe("mock");
    expect(createImageProvider({}).id).toBe("mock");
  });

  it("VISUALS_PROVIDER=openai builds the OpenAI provider with the configured models", () => {
    const p = createImageProvider({ VISUALS_PROVIDER: "openai", OPENAI_API_KEY: "sk", VISUALS_OPENAI_MODEL: "gpt-image-1" });
    expect(p.id).toBe("openai:gpt-image-1");
    expect(createImageProvider({ VISUALS_PROVIDER: "openai", OPENAI_API_KEY: "sk" }).id).toBe("openai:gpt-image-2.5-flare");
  });

  it("production defaults to OpenAI when a key exists, and refuses the mock-less combination without a key", () => {
    expect(createImageProvider({ NODE_ENV: "production", OPENAI_API_KEY: "sk" }).id).toMatch(/^openai:/);
    expect(() => createImageProvider({ NODE_ENV: "production" })).toThrow(/OPENAI_API_KEY/);
    expect(() => createImageProvider({ VISUALS_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects unknown providers and does not yet ship gemini", () => {
    expect(() => createImageProvider({ VISUALS_PROVIDER: "midjourney" })).toThrow(/VISUALS_PROVIDER/);
    expect(() => createImageProvider({ VISUALS_PROVIDER: "gemini" })).toThrow(/not available/i);
  });

  it("the mock is refused in production even if asked for", () => {
    expect(() => createImageProvider({ NODE_ENV: "production", VISUALS_PROVIDER: "mock" })).toThrow(/production/);
  });
});
