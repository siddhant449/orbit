import { shortDate } from "./analytics-view";
import { tickIndexes } from "./chart";
import { formatCount, formatSignedCount, plural } from "./format";
import { buildHeatmap, type Heatmap } from "./heatmap";
import { WEEKDAY_ROWS, WRITING_BLOCKS, type LocalActivity, type Streak } from "./local-activity";

export type LocalStat = { key: string; label: string; value: number; delta: string };
export type LocalAnalyticsView = {
  stats: LocalStat[];
  chart: { current: number[]; previous: number[]; ticks: { index: number; label: string }[]; summary: string };
  writing: Heatmap;
};

const blockLabel = (h: string) => {
  const n = Number(h);
  return n === 0 ? "12 AM" : n === 12 ? "12 PM" : n > 12 ? `${n - 12} PM` : `${n} AM`;
};

function streakNote(s: Streak): string {
  if (s.current === 0) return s.best > 0 ? `Best ${plural(s.best, "day")}` : "Start one today";
  if (!s.wroteToday) return "Write today to keep it";
  return `Best ${plural(s.best, "day")}`;
}

/**
 * The not-connected Analytics screen's real numbers (A14): what the profile drafted in Orbit, never LinkedIn
 * statistics.
 */
export function localAnalyticsView(a: LocalActivity, streak: Streak): LocalAnalyticsView {
  // Counts here are small, so the change is a signed count, not a percentage ("+3 vs previous 30 days").
  const vs = (cur: number, prev: number) => `${formatSignedCount(cur - prev).text} vs previous ${a.range} days`;
  const { dates, current, previous } = a.series;
  const total = current.reduce((s, n) => s + n, 0);
  const prevTotal = previous.reduce((s, n) => s + n, 0);
  const peak = current.reduce((best, v, i) => (v > current[best]! ? i : best), 0);

  return {
    stats: [
      { key: "posts-drafted", label: "Posts drafted", value: a.postsDrafted.current, delta: vs(a.postsDrafted.current, a.postsDrafted.previous) },
      { key: "writing-streak", label: "Writing streak", value: streak.current, delta: streakNote(streak) },
      { key: "revisions", label: "Revisions", value: a.revisions.current, delta: vs(a.revisions.current, a.revisions.previous) },
      { key: "active-days", label: "Active days", value: a.activeDays.current, delta: `of ${a.activeDays.of}` },
    ],
    chart: {
      current,
      previous,
      ticks: tickIndexes(dates.length, 5).map((index) => ({ index, label: shortDate(dates[index]!) })),
      summary:
        total === 0
          ? `Nothing saved in the last ${a.range} days.`
          : `Versions saved per day over the last ${a.range} days: ${formatCount(total)} in total, most on ${shortDate(dates[peak]!)} with ${formatCount(current[peak]!)}. The previous ${a.range} days had ${formatCount(prevTotal)}.`,
    },
    writing: buildHeatmap({ rows: [...WEEKDAY_ROWS], cols: [...WRITING_BLOCKS], values: a.writingTimes, colLabel: blockLabel }),
  };
}
