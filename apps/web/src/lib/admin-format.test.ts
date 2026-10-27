import { describe, expect, it } from "vitest";
import { buildChart, featureRows, parseCapUsd, usd } from "./admin-format";

describe("usd", () => {
  it("shows cents above a dollar and four places below it", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(1_234)).toBe("$0.0012");
    expect(usd(5)).toBe("<$0.0001");
    expect(usd(2_500_000)).toBe("$2.50");
  });
});

describe("parseCapUsd", () => {
  it("parses dollars to micro-USD; empty means the default", () => {
    expect(parseCapUsd("2.50")).toBe(2_500_000);
    expect(parseCapUsd("$3")).toBe(3_000_000);
    expect(parseCapUsd("0")).toBe(0);
    expect(parseCapUsd("  ")).toBeNull();
  });
  it("rejects junk and absurd caps", () => {
    for (const bad of ["abc", "-1", "1e3", "1,5", "5001"]) expect(() => parseCapUsd(bad)).toThrow(RangeError);
  });
});

describe("buildChart", () => {
  const now = new Date("2026-10-27T10:00:00Z");
  it("returns 30 UTC days oldest first, stacked by the top features, with the rest folded in", () => {
    const rows = [
      { day: "2026-10-27", feature: "chat", costMicroUsd: 900, calls: 3 },
      { day: "2026-10-27", feature: "ideas", costMicroUsd: 100, calls: 1 },
      { day: "2026-10-20", feature: "chat", costMicroUsd: 500, calls: 2 },
      ...["a", "b", "c", "d", "e"].map((f) => ({ day: "2026-10-26", feature: f, costMicroUsd: 10, calls: 1 })),
    ];
    const c = buildChart(rows, 30, now);
    expect(c.days).toHaveLength(30);
    expect(c.days[0]!.day).toBe("2026-09-28");
    expect(c.days.at(-1)!.day).toBe("2026-10-27");
    expect(c.days.at(-1)!.total).toBe(1000);
    expect(c.legend).toHaveLength(6); // five features plus "rest"
    expect(c.legend.at(-1)).toBe("rest");
    expect(c.total).toBe(1000 + 500 + 50);
    expect(c.max).toBe(1000);
  });
  it("is all zero bars with no rows", () => {
    const c = buildChart([], 30, now);
    expect(c.max).toBe(0);
    expect(c.days.every((d) => d.parts.length === 0)).toBe(true);
  });
});

describe("featureRows", () => {
  it("sorts by 30-day cost", () => {
    const rows = featureRows({ today: { a: 1 }, week: { a: 2, b: 5 }, month: { a: 3, b: 9 } });
    expect(rows.map((r) => r.feature)).toEqual(["b", "a"]);
    expect(rows[1]).toEqual({ feature: "a", today: 1, week: 2, month: 3 });
  });
});
