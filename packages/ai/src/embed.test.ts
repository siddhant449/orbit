import { describe, expect, it } from "vitest";
import { MockEmbeddingModelV4 } from "ai/test";
import { AiUnavailableError } from "./client";
import { createEmbedder, EMBEDDING_DIMENSIONS } from "./embed";
import { fakeEmbedder } from "./testing";

const mock = (dims: number) =>
  new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: 1000,
    doEmbed: async ({ values }) => ({
      embeddings: values.map(() => new Array<number>(dims).fill(0.1)),
      warnings: [],
    }),
  });

describe("createEmbedder", () => {
  it("batches 130 texts into 3 embedMany calls", async () => {
    const model = mock(EMBEDDING_DIMENSIONS);
    const out = await createEmbedder("k", { model }).embed(Array.from({ length: 130 }, (_, i) => `t${i}`));
    expect(out).toHaveLength(130);
    expect(model.doEmbedCalls).toHaveLength(3);
  });
  it("throws AiUnavailableError lazily without a key", async () => {
    const e = createEmbedder("");
    await expect(e.embed(["x"])).rejects.toBeInstanceOf(AiUnavailableError);
  });
  it("rejects vectors of the wrong length", async () => {
    await expect(createEmbedder("k", { model: mock(3) }).embed(["x"])).rejects.toThrow(/1536/);
  });
});

describe("fakeEmbedder", () => {
  it("is deterministic, 1536-d and unit length", async () => {
    const e = fakeEmbedder();
    const [a] = await e.embed(["Zebra migration"]);
    const [b] = await e.embed(["zebra migration"]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1536);
    expect(Math.hypot(...a!)).toBeCloseTo(1);
    expect(e.calls).toBe(2);
  });
});
