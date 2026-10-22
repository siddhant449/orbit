import { describe, expect, it } from "vitest";
import { objectKey } from "./keys";

describe("objectKey", () => {
  it("builds unguessable profile-scoped keys and rejects traversal", () => {
    expect(objectKey("ckabc123", "visual", "png")).toMatch(/^p\/ckabc123\/visual\/[A-Za-z0-9_-]{22}\.png$/);
    expect(() => objectKey("../x", "visual", "png")).toThrow();
    expect(() => objectKey("ckabc123", "../v", "png")).toThrow();
    expect(() => objectKey("ckabc123", "visual", "p/ng")).toThrow();
  });

  it("never repeats", () => {
    const keys = new Set(Array.from({ length: 200 }, () => objectKey("ck1", "visual", "png")));
    expect(keys.size).toBe(200);
  });
});
