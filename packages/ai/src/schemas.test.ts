import { describe, expect, it } from "vitest";
import { StrategySchema, normalizePercents } from "./schemas";

const sum = (xs: { percent: number }[]) => xs.reduce((a, x) => a + x.percent, 0);

const validStrategy = {
  goal: "get_customers",
  goalWhy: "w",
  positioning: "p",
  positioningWhy: "w",
  tagline: "t",
  expertise: "e",
  expertiseWhy: "w",
  contentMix: [{ type: "educational", percent: 100 }],
  audienceBalance: [{ level: "broad", percent: 100, note: "n" }],
  contentFormats: [{ format: "text", perWeek: 3, note: "n" }],
  recurringSeries: [{ name: "n", weekday: "mon", description: "d" }],
};

describe("normalizePercents", () => {
  it("makes thirds sum to 100", () => {
    const out = normalizePercents([{ percent: 33.3 }, { percent: 33.3 }, { percent: 33.3 }]);
    expect(sum(out)).toBe(100);
  });
  it("scales 50/70 to 100 keeping the ratio within 1", () => {
    const out = normalizePercents([{ percent: 50 }, { percent: 70 }]);
    expect(sum(out)).toBe(100);
    expect(Math.abs(out[0]!.percent - 41.67)).toBeLessThanOrEqual(1);
    expect(Math.abs(out[1]!.percent - 58.33)).toBeLessThanOrEqual(1);
  });
  it("returns empty for empty", () => {
    expect(normalizePercents([])).toEqual([]);
  });
});

describe("StrategySchema", () => {
  it("accepts a valid strategy", () => {
    expect(StrategySchema.parse(validStrategy).goal).toBe("get_customers");
  });
  it("rejects goal fame", () => {
    expect(() => StrategySchema.parse({ ...validStrategy, goal: "fame" })).toThrow();
  });
});
