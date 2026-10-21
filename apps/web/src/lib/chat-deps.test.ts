import { afterEach, describe, expect, it, vi } from "vitest";

// @brandloop/agent imports @brandloop/db, whose client needs DATABASE_URL at import (no query is made here).
vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* already set */
  }
});

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

import { getChatDeps, isMockMode } from "./chat-deps";

const modelIdOf = (m: unknown) => (m as { modelId: string }).modelId;

afterEach(() => vi.unstubAllEnvs());

describe("isMockMode", () => {
  it("is on only for AI_MOCK_MODEL=1 outside production", () => {
    expect(isMockMode({ AI_MOCK_MODEL: "1", NODE_ENV: "development" })).toBe(true);
    expect(isMockMode({ AI_MOCK_MODEL: "1", NODE_ENV: "test" })).toBe(true);
    expect(isMockMode({ AI_MOCK_MODEL: "1", NODE_ENV: "production" })).toBe(false);
    expect(isMockMode({ AI_MOCK_MODEL: "true", NODE_ENV: "development" })).toBe(false);
    expect(isMockMode({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("getChatDeps", () => {
  it("uses the scripted model, client and embedder in mock mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_MOCK_MODEL", "1");
    const deps = getChatDeps();
    expect(modelIdOf(deps.model)).toBe("mock-chat");
    expect(await deps.ai.text({ model: "extract", system: "s", prompt: "p" })).toBe("Mock chat");
    expect(deps.webSearchTool ?? null).toBeNull();
    expect((await deps.embedder!.embed(["hello"]))[0]).toHaveLength(1536);
  });

  it("ignores AI_MOCK_MODEL in production and uses the real models", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_MOCK_MODEL", "1");
    vi.stubEnv("AI_MODEL_GENERATE", undefined);
    const deps = getChatDeps();
    expect(modelIdOf(deps.model)).toBe("gpt-6.1-sol");
    expect((deps.webSearchTool as { id: string }).id).toBe("openai.web_search");
  });

  it("shares one run registry across calls", () => {
    expect(getChatDeps().registry).toBe(getChatDeps().registry);
  });
});
