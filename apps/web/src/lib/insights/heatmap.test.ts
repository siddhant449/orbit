import { describe, expect, it } from "vitest";
import { buildHeatmap, HEAT_STEPS } from "./heatmap";

describe("buildHeatmap", () => {
  const rows = ["Mon", "Tue"];
  const cols = ["6", "8", "10"];

  it("maps each value to a stepped intensity relative to the max and finds the peak", () => {
    const h = buildHeatmap({ rows, cols, values: [[0, 2, 4], [1, 8, 3]] });
    expect(h.cells[1]![1]).toMatchObject({ value: 8, step: HEAT_STEPS - 1, peak: true });
    expect(h.cells[0]![0]).toMatchObject({ value: 0, step: 0, peak: false });
    expect(h.cells[0]![2]!.step).toBe(Math.round((4 / 8) * (HEAT_STEPS - 1)));
    expect(h.peak).toEqual({ row: 1, col: 1, label: "Tue · 8" });
    expect(h.total).toBe(18);
  });

  it("has no peak when every cell is empty", () => {
    const h = buildHeatmap({ rows, cols, values: [[0, 0, 0], [0, 0, 0]] });
    expect(h.peak).toBeNull();
    expect(h.cells.flat().every((c) => c.step === 0 && !c.peak)).toBe(true);
  });

  it("formats the peak label with a column formatter", () => {
    const h = buildHeatmap({ rows, cols, values: [[0, 0, 0], [0, 0, 1]], colLabel: (c) => `${c} AM` });
    expect(h.peak?.label).toBe("Tue · 10 AM");
  });

  it("rejects a values grid that doesn't match the axes", () => {
    expect(() => buildHeatmap({ rows, cols, values: [[1, 2, 3]] })).toThrow();
  });
});
