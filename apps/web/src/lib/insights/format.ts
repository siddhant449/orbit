/** Number and time formatting for the Analytics and Engage screens (data register, system §6.8). */

export type Direction = "up" | "down" | "flat";
export type Delta = { text: string; direction: Direction };

const MINUS = "−";
const trim1 = (n: number) => String(Math.round(n * 10) / 10);

/** 28400 → "28.4k", 1842310 → "1.8M"; under 1000 stays whole. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim1(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim1(n / 1_000)}k`;
  return String(Math.round(n));
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function signed(n: number, unit: string): Delta {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return { text: `0${unit}`, direction: "flat" };
  return { text: `${r > 0 ? "+" : MINUS}${Math.abs(r)}${unit}`, direction: r > 0 ? "up" : "down" };
}

/** Change against the previous value as a percentage; "new" when there was nothing before. */
export function formatPercentDelta(current: number, previous: number): Delta {
  if (previous === 0) return current === 0 ? { text: "0%", direction: "flat" } : { text: "new", direction: "up" };
  return signed(((current - previous) / previous) * 100, "%");
}

/** Change between two rates (fractions) in percentage points. */
export function formatPointsDelta(current: number, previous: number): Delta {
  return signed((current - previous) * 100, " pts");
}

export function formatSignedCount(diff: number): Delta {
  if (diff === 0) return { text: "±0", direction: "flat" };
  return { text: `${diff > 0 ? "+" : MINUS}${formatCount(Math.abs(diff))}`, direction: diff > 0 ? "up" : "down" };
}

/** "just now", "40 min", "3h", "2d". */
export function formatRelativeAge(then: Date, now: Date): string {
  const min = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;
