import { afterEach, describe, expect, it, vi } from "vitest";
import { getModel } from "./provider";

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

  it("follows the AI_MODEL_* overrides", () => {
    vi.stubEnv("AI_MODEL_EXTRACT", "custom-extract");
    expect((getModel("extract") as { modelId: string }).modelId).toBe("custom-extract");
  });
});
