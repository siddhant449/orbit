/** Weekday × time-of-day heatmap (system §6.16, p09): stepped accent-wash intensities and the strongest cell. */

/** Intensity steps; step 0 is an empty cell, the last step is the peak colour. */
export const HEAT_STEPS = 6;

export type HeatCell = { value: number; step: number; peak: boolean };
export type Heatmap = {
  rows: string[];
  cols: string[];
  cells: HeatCell[][];
  peak: { row: number; col: number; label: string } | null;
  total: number;
};

export function buildHeatmap({
  rows,
  cols,
  values,
  colLabel = (c) => c,
  minPeak = 1,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  colLabel?: (col: string) => string;
  /** The strongest cell is only called out when it reaches this count; below it the grid has no peak. */
  minPeak?: number;
}): Heatmap {
  if (values.length !== rows.length || values.some((r) => r.length !== cols.length)) {
    throw new Error("Heatmap values must be rows × cols.");
  }
  let max = 0;
  let peakAt: { row: number; col: number } | null = null;
  let total = 0;
  values.forEach((r, ri) =>
    r.forEach((v, ci) => {
      total += v;
      if (v > max) {
        max = v;
        peakAt = { row: ri, col: ci };
      }
    }),
  );
  const at = max >= minPeak ? (peakAt as { row: number; col: number } | null) : null;
  const cells = values.map((r, ri) =>
    r.map((value, ci) => ({
      value,
      step: max > 0 ? Math.round((value / max) * (HEAT_STEPS - 1)) : 0,
      peak: at?.row === ri && at.col === ci,
    })),
  );
  const peak = at && { ...at, label: `${rows[at.row]} · ${colLabel(cols[at.col]!)}` };
  return { rows, cols, cells, peak, total };
}
