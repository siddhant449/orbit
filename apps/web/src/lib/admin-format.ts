import type { DayFeatureRow, PeriodTotals } from "@brandloop/db";

/** Dollars from micro-USD for display: cents above $1, four places below it, so small costs do not read as $0.00. */
export function usd(micro: number): string {
  const dollars = micro / 1_000_000;
  if (micro === 0) return "$0.00";
  if (micro < 100) return "<$0.0001";
  return dollars >= 1 ? `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${dollars.toFixed(4)}`;
}

export function compactNumber(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Dollars typed by an admin ("2.50", "$3", "") to micro-USD; "" means the default (null). Throws RangeError on bad input. */
export function parseCapUsd(input: string): number | null {
  const t = input.trim().replace(/^\$/, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,6})?$/.test(t)) throw new RangeError("Enter a dollar amount like 2.50, or leave it empty for the default.");
  const micro = Math.round(Number(t) * 1_000_000);
  if (micro > 1_000_000_000) throw new RangeError("Daily cap must be $1,000 or less.");
  return micro;
}

export const FEATURE_LABELS: Record<string, string> = {
  chat: "Chat",
  writing: "Writing",
  editing: "Editing",
  polish: "Polish",
  review: "Review",
  research: "Research",
  ideas: "Ideas",
  hooks: "Hooks",
  title: "Titles",
  moderation: "Moderation",
  "memory-learning": "Memory learning",
  "style-learning": "Style learning",
  "style-extract": "Style extraction",
  strategy: "Strategy",
  onboarding: "Onboarding",
  images: "Images",
  embeddings: "Embeddings",
  other: "Other",
  rest: "Everything else",
};
export const featureLabel = (f: string) => FEATURE_LABELS[f] ?? f;

export type ChartDay = { day: string; label: string; total: number; parts: { feature: string; micro: number }[] };
export type ChartData = { days: ChartDay[]; legend: string[]; max: number; total: number };

const DAY_MS = 86_400_000;
const SHOWN = 5;

/** 30 (or `days`) UTC days oldest first, stacked by the biggest features; the rest fold into "other". Days with no spend are zero bars. */
export function buildChart(rows: DayFeatureRow[], days: number, now: Date): ChartData {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.feature, (totals.get(r.feature) ?? 0) + r.costMicroUsd);
  const legend = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, SHOWN).map(([f]) => f);
  const shown = new Set(legend);
  const hasRest = [...totals.keys()].some((f) => !shown.has(f));
  const byDay = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const f = shown.has(r.feature) ? r.feature : "rest";
    const m = byDay.get(r.day) ?? new Map<string, number>();
    m.set(f, (m.get(f) ?? 0) + r.costMicroUsd);
    byDay.set(r.day, m);
  }
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: ChartDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(midnight - i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    const m = byDay.get(key) ?? new Map<string, number>();
    const order = hasRest ? [...legend, "rest"] : legend;
    const parts = order.map((feature) => ({ feature, micro: m.get(feature) ?? 0 })).filter((p) => p.micro > 0);
    out.push({ day: key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), total: parts.reduce((n, p) => n + p.micro, 0), parts });
  }
  return { days: out, legend: hasRest ? [...legend, "rest"] : legend, max: Math.max(0, ...out.map((d) => d.total)), total: out.reduce((n, d) => n + d.total, 0) };
}

export const sumTotals = (t: Record<string, number>) => Object.values(t).reduce((n, v) => n + v, 0);

/** Rows for the feature table: every feature with spend in the last 30 days, biggest first. */
export function featureRows(totals: PeriodTotals): { feature: string; today: number; week: number; month: number }[] {
  return Object.keys(totals.month)
    .map((feature) => ({ feature, today: totals.today[feature] ?? 0, week: totals.week[feature] ?? 0, month: totals.month[feature] ?? 0 }))
    .sort((a, b) => b.month - a.month);
}
