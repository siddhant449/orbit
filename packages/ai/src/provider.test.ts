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
    expect((getModel("generate") as { modelId: string }).modelId).toBe("gpt-6.1-sol");
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
      expect(generate.modelId).toBe("gpt-6.1-sol");
      expect(extract.modelId).toBe("gpt-6-luna");
      expect(generate.provider).toContain("openai");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("applies the AI_MODEL_* overrides to a keyed model too", () => {
    vi.stubEnv("AI_MODEL_GENERATE", "custom-generate");
    expect((getModel("generate", "sk-test-not-real") as { modelId: string }).modelId).toBe(
      "custom-generate",
    );
  });

  it("follows the AI_MODEL_* overrides", () => {
    vi.stubEnv("AI_MODEL_EXTRACT", "custom-extract");
    expect((getModel("extract") as { modelId: string }).modelId).toBe("custom-extract");
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
