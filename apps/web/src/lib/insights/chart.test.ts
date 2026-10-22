import { describe, expect, it } from "vitest";
import { chartGeometry, tickIndexes } from "./chart";

describe("chartGeometry", () => {
  it("scales both series against one shared max with headroom, top-down y", () => {
    const g = chartGeometry({ current: [0, 50, 100], previous: [0, 25, 50], width: 760, height: 240 });
    // max 100 → ceiling 100 / 0.85 so the peak sits below the top edge.
    expect(g.current.points[0]).toEqual({ x: 0, y: 240 });
    expect(g.current.points[2]!.x).toBe(760);
    expect(g.current.points[2]!.y).toBeCloseTo(240 - 240 * 0.85, 5);
    expect(g.previous!.points[2]!.y).toBeCloseTo(240 - 240 * 0.425, 5);
    expect(g.current.line.startsWith("M0 240 L380 ")).toBe(true);
    expect(g.current.area.endsWith("L760 240 L0 240 Z")).toBe(true);
  });

  it("marks the peak of the current series", () => {
    const g = chartGeometry({ current: [3, 9, 4], width: 100, height: 100 });
    expect(g.peak).toEqual({ index: 1, x: 50, y: g.current.points[1]!.y });
    expect(g.previous).toBeNull();
  });

  it("draws a flat baseline when every value is zero", () => {
    const g = chartGeometry({ current: [0, 0, 0, 0], width: 90, height: 60 });
    expect(g.current.points.every((p) => p.y === 60)).toBe(true);
    expect(g.peak).toBeNull();
  });

  it("puts a single point in the middle", () => {
    const g = chartGeometry({ current: [5], width: 100, height: 100 });
    expect(g.current.points[0]!.x).toBe(50);
  });
});

describe("tickIndexes", () => {
  it("spreads n ticks evenly including both ends", () => {
    expect(tickIndexes(30, 5)).toEqual([0, 7, 15, 22, 29]);
    expect(tickIndexes(7, 5)).toEqual([0, 2, 3, 5, 6]);
  });
  it("never returns more ticks than points", () => {
    expect(tickIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(tickIndexes(0, 5)).toEqual([]);
  });
});
