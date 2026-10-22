import { describe, expect, it } from "vitest";
import { formatCompact, formatCount, formatPercentDelta, formatPointsDelta, formatRelativeAge, formatSignedCount } from "./format";

describe("formatCompact", () => {
  it("keeps small numbers whole and compacts thousands and millions to one decimal", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(9_800)).toBe("9.8k");
    expect(formatCompact(28_400)).toBe("28.4k");
    expect(formatCompact(15_000)).toBe("15k");
    expect(formatCompact(1_842_310)).toBe("1.8M");
  });
});

describe("formatCount", () => {
  it("groups thousands", () => {
    expect(formatCount(1842310)).toBe("1,842,310");
    expect(formatCount(7)).toBe("7");
  });
});

describe("formatPercentDelta", () => {
  it("returns a signed percentage against the previous value, one decimal", () => {
    expect(formatPercentDelta(141.6, 100)).toEqual({ text: "+41.6%", direction: "up" });
    expect(formatPercentDelta(80, 100)).toEqual({ text: "−20%", direction: "down" });
    expect(formatPercentDelta(5, 5)).toEqual({ text: "0%", direction: "flat" });
  });
  it("has no percentage when there was nothing before", () => {
    expect(formatPercentDelta(4, 0)).toEqual({ text: "new", direction: "up" });
    expect(formatPercentDelta(0, 0)).toEqual({ text: "0%", direction: "flat" });
  });
});

describe("formatPointsDelta", () => {
  it("reports rate changes in percentage points", () => {
    expect(formatPointsDelta(0.052, 0.049)).toEqual({ text: "+0.3 pts", direction: "up" });
    expect(formatPointsDelta(0.04, 0.05)).toEqual({ text: "−1 pts", direction: "down" });
  });
});

describe("formatSignedCount", () => {
  it("signs a count difference", () => {
    expect(formatSignedCount(612)).toEqual({ text: "+612", direction: "up" });
    expect(formatSignedCount(-3)).toEqual({ text: "−3", direction: "down" });
    expect(formatSignedCount(0)).toEqual({ text: "±0", direction: "flat" });
  });
});

describe("formatRelativeAge", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("uses minutes under an hour, hours under a day, then days", () => {
    expect(formatRelativeAge(new Date("2026-10-22T11:59:40Z"), now)).toBe("just now");
    expect(formatRelativeAge(new Date("2026-10-22T11:20:00Z"), now)).toBe("40 min");
    expect(formatRelativeAge(new Date("2026-10-22T09:00:00Z"), now)).toBe("3h");
    expect(formatRelativeAge(new Date("2026-10-20T12:00:00Z"), now)).toBe("2d");
  });
});
