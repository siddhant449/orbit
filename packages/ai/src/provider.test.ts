import { afterEach, describe, expect, it, vi } from "vitest";
import { getModel, webSearchTool } from "./provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getModel", () => {
  it("is lazy: building a model never needs OPENAI_API_KEY", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MODEL_GENERATE", undefined);
    vi.stubEnv("AI_MODEL_EXTRACT", undefined);
    expect(typeof getModel("generate")).toBe("object");
    expect((getModel("generate") as { modelId: string }).modelId).toBe("gpt-6-luna");
    expect((getModel("extract") as { modelId: string }).modelId).toBe("gpt-6-luna");
  });

  it("binds an explicit key without touching the environment or the network", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MODEL_GENERATE", undefined);
    vi.stubEnv("AI_MODEL_EXTRACT", undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const generate = getModel("generate", "sk-test-not-real") as { modelId: string; provider: string };
      const extract = getModel("extract", "sk-test-not-real") as { modelId: string; provider: string };
      expect(generate.modelId).toBe("gpt-6-luna");
      expect(extract.modelId).toBe("gpt-6-luna");
      expect(generate.provider).toContain("openai");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("a disallowed AI_MODEL_* override falls back to Luna, keyed model too", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AI_MODEL_GENERATE", "custom-generate");
    expect((getModel("generate", "sk-test-not-real") as { modelId: string }).modelId).toBe("gpt-6-luna");
  });

  it("follows an allowed AI_MODEL_* override", () => {
    vi.stubEnv("AI_MODEL_EXTRACT", "gpt-6-luna");
    expect((getModel("extract") as { modelId: string }).modelId).toBe("gpt-6-luna");
  });
});

describe("webSearchTool", () => {
  it("is OpenAI's hosted web search, built without a key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const t = webSearchTool() as { type: string; id: string };
    expect(t.type).toBe("provider");
    expect(t.id).toBe("openai.web_search");
  });
});

describe("write alias", () => {
  it("follows the generate model; a costlier AI_MODEL_WRITE is ignored (cost control)", async () => {
    const { resolveModel } = await import("./provider");
    const before = { w: process.env.AI_MODEL_WRITE, g: process.env.AI_MODEL_GENERATE };
    delete process.env.AI_MODEL_WRITE;
    delete process.env.AI_MODEL_GENERATE;
    expect(resolveModel("write")).toBe("gpt-6-luna");
    process.env.AI_MODEL_WRITE = "gpt-6.1-sol";
    const warn = console.warn;
    console.warn = () => {};
    expect(resolveModel("write")).toBe("gpt-6-luna");
    console.warn = warn;
    expect(resolveModel("generate")).toBe("gpt-6-luna");
    if (before.w === undefined) delete process.env.AI_MODEL_WRITE; else process.env.AI_MODEL_WRITE = before.w;
    if (before.g !== undefined) process.env.AI_MODEL_GENERATE = before.g;
  });
});
