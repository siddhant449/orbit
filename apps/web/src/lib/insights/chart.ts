/** Geometry for the line chart (system §6.16, p09): two series on one scale, SVG paths in a fixed viewBox. */

export type Point = { x: number; y: number };
export type Series = { points: Point[]; line: string; area: string };

/** The peak sits at 85 % of the height so the glow and the marker never clip. */
const HEADROOM = 0.85;

const r2 = (n: number) => Math.round(n * 100) / 100;

function series(values: number[], width: number, height: number, max: number): Series {
  const n = values.length;
  const points = values.map((v, i) => ({
    x: n === 1 ? width / 2 : r2((i / (n - 1)) * width),
    y: max > 0 ? r2(height - (v / max) * height * HEADROOM) : height,
  }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const first = points[0]?.x ?? 0;
  const last = points.at(-1)?.x ?? width;
  const area = points.length ? `${line} L${last} ${height} L${first} ${height} Z` : "";
  return { points, line, area };
}

export function chartGeometry({
  current,
  previous,
  width,
  height,
}: {
  current: number[];
  previous?: number[];
  width: number;
  height: number;
}) {
  const max = Math.max(0, ...current, ...(previous ?? []));
  const cur = series(current, width, height, max);
  let peak: { index: number; x: number; y: number } | null = null;
  if (max > 0 && current.length) {
    const index = current.reduce((best, v, i) => (v > current[best]! ? i : best), 0);
    if (current[index]! > 0) peak = { index, x: cur.points[index]!.x, y: cur.points[index]!.y };
  }
  return { current: cur, previous: previous?.length ? series(previous, width, height, max) : null, peak, max };
}

/** `count` indexes spread evenly over `length` points, both ends included. */
export function tickIndexes(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length <= count) return Array.from({ length }, (_, i) => i);
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - 1)) / (count - 1)));
}
