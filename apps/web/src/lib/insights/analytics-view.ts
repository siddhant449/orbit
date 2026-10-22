import { tickIndexes } from "./chart";
import { formatCompact, formatCount, formatPercentDelta, formatPointsDelta, formatRelativeAge, formatSignedCount, type Delta } from "./format";
import { buildHeatmap, type Heatmap } from "./heatmap";
import type { Range } from "./local-activity";

/**
 * What the LinkedIn analytics sync will hand the Analytics screen (screens.md B7, p09). The shape follows the
 * Community Management API's member post and follower statistics, aggregated per range on the server. Nothing
 * produces it yet: until LinkedIn is connected the page renders its not-connected state instead.
 */
export type AnalyticsSnapshot = {
  range: Range;
  /** When the cached statistics were last pulled from LinkedIn (ISO). */
  refreshedAt: string;
  metrics: {
    impressions: { current: number; previous: number };
    /** Unique members reached. */
    reach: { current: number; previous: number };
    /** Engagements / impressions, as a fraction. */
    engagementRate: { current: number; previous: number };
    newFollowers: { current: number; previous: number };
  };
  /** One row per day in the range, oldest first; `previous` is the same weekday offset in the window before. */
  daily: { date: string; impressions: number; previous: number }[];
  topPosts: {
    id: string;
    title: string;
    reactions: number;
    comments: number;
    impressions: number;
    /** The Orbit draft it was published from, when known. */
    documentId: string | null;
    url: string | null;
  }[];
  /** Mon..Fri × 6, 8, 10, 12, 14, 16 h: average engagement per post published in that slot. */
  postingTimes: number[][];
  /** Distinct members who reacted or commented in the range. */
  whoEngaged: number;
};

export type StatView = { key: string; label: string; value: number; display: string; suffix: string; decimals: number; delta: Delta };

export type AnalyticsView = {
  status: string;
  stats: StatView[];
  chart: { dates: string[]; current: number[]; previous: number[]; ticks: { index: number; label: string }[]; summary: string };
  topPosts: { id: string; title: string; meta: string; value: string; href: string | null }[];
  bestTime: Heatmap;
  whoEngaged: string;
  range: Range;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-06" → "6 Oct". */
export function shortDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

export const POSTING_HOURS = ["6", "8", "10", "12", "14", "16"];
const hourLabel = (h: string) => {
  const n = Number(h);
  return n === 12 ? "12 PM" : n > 12 ? `${n - 12} PM` : `${n} AM`;
};

export function buildAnalyticsView(s: AnalyticsSnapshot, now: Date): AnalyticsView {
  const m = s.metrics;
  const rate = m.engagementRate.current * 100;
  const impressionsDelta = formatPercentDelta(m.impressions.current, m.impressions.previous);
  const stats: StatView[] = [
    {
      key: "impressions",
      label: "Impressions",
      value: m.impressions.current,
      display: formatCount(m.impressions.current),
      suffix: "",
      decimals: 0,
      delta: { ...impressionsDelta, text: `${impressionsDelta.text} vs previous ${s.range} days` },
    },
    {
      key: "reach",
      label: "Reach",
      value: m.reach.current,
      display: formatCount(m.reach.current),
      suffix: "",
      decimals: 0,
      delta: formatPercentDelta(m.reach.current, m.reach.previous),
    },
    {
      key: "engagement-rate",
      label: "Engagement rate",
      value: Math.round(rate * 10) / 10,
      display: `${Math.round(rate * 10) / 10}%`,
      suffix: "%",
      decimals: 1,
      delta: formatPointsDelta(m.engagementRate.current, m.engagementRate.previous),
    },
    {
      key: "new-followers",
      label: "New followers",
      value: m.newFollowers.current,
      display: formatCount(m.newFollowers.current),
      suffix: "",
      decimals: 0,
      delta: formatSignedCount(m.newFollowers.current - m.newFollowers.previous),
    },
  ];

  const current = s.daily.map((d) => d.impressions);
  const previous = s.daily.map((d) => d.previous);
  const total = current.reduce((a, b) => a + b, 0);
  const prevTotal = previous.reduce((a, b) => a + b, 0);
  const peakIndex = current.reduce((best, v, i) => (v > current[best]! ? i : best), 0);
  const summary = s.daily.length
    ? `Impressions over the last ${s.range} days: ${formatCount(total)} in total, highest on ${shortDate(s.daily[peakIndex]!.date)} with ${formatCount(current[peakIndex]!)}. The previous ${s.range} days had ${formatCount(prevTotal)}.`
    : `No impressions recorded in the last ${s.range} days.`;

  return {
    range: s.range,
    status: `LinkedIn connected · official API · refreshed ${formatRelativeAge(new Date(s.refreshedAt), now).replace(/^(\d+.*)$/, "$1 ago")}`,
    stats,
    chart: {
      dates: s.daily.map((d) => d.date),
      current,
      previous,
      ticks: tickIndexes(s.daily.length, 5).map((index) => ({ index, label: shortDate(s.daily[index]!.date) })),
      summary,
    },
    topPosts: [...s.topPosts]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        title: p.title,
        meta: `${formatCount(p.reactions)} reactions · ${formatCount(p.comments)} comments`,
        value: formatCompact(p.impressions),
        href: p.documentId ? `/posts/${p.documentId}` : p.url,
      })),
    bestTime: buildHeatmap({ rows: ["Mon", "Tue", "Wed", "Thu", "Fri"], cols: POSTING_HOURS, values: s.postingTimes, colLabel: hourLabel }),
    whoEngaged: `Who engaged · ${formatCount(s.whoEngaged)}`,
  };
}
