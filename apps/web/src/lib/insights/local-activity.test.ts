import { describe, expect, it } from "vitest";
import { dayKey, localActivity, writingStreak, type ActivityInput } from "./local-activity";
import { localAnalyticsView } from "./local-view";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-22T15:00:00Z"); // Thursday

describe("dayKey", () => {
  it("is the calendar day in the profile's timezone", () => {
    expect(dayKey(at("2026-10-22T02:00:00Z"), "UTC")).toBe("2026-10-22");
    expect(dayKey(at("2026-10-22T02:00:00Z"), "America/New_York")).toBe("2026-10-21");
    expect(dayKey(at("2026-10-22T02:00:00Z"), "Not/AZone")).toBe("2026-10-22");
  });
});

describe("writingStreak", () => {
  it("counts consecutive days with a saved version ending today", () => {
    const days = ["2026-10-22T09:00:00Z", "2026-10-21T09:00:00Z", "2026-10-20T23:00:00Z", "2026-10-18T09:00:00Z"].map(at);
    expect(writingStreak(days, NOW, "UTC")).toEqual({ current: 3, best: 3, wroteToday: true });
  });

  it("keeps yesterday's streak alive until today ends", () => {
    const days = ["2026-10-21T09:00:00Z", "2026-10-20T09:00:00Z"].map(at);
    expect(writingStreak(days, NOW, "UTC")).toEqual({ current: 2, best: 2, wroteToday: false });
  });

  it("is zero after a missed day but remembers the best run", () => {
    const days = ["2026-10-10T09:00:00Z", "2026-10-11T09:00:00Z", "2026-10-12T09:00:00Z", "2026-10-13T09:00:00Z", "2026-10-20T09:00:00Z"].map(at);
    expect(writingStreak(days, NOW, "UTC")).toEqual({ current: 0, best: 4, wroteToday: false });
  });

  it("uses the profile's timezone for day boundaries", () => {
    // 01:00 UTC on the 22nd is the evening of the 21st in New York: with the 22nd's write, two days in a row.
    const days = ["2026-10-22T01:00:00Z", "2026-10-22T14:00:00Z"].map(at);
    expect(writingStreak(days, NOW, "UTC").current).toBe(1);
    expect(writingStreak(days, NOW, "America/New_York").current).toBe(2);
  });

  it("is empty with no writing", () => {
    expect(writingStreak([], NOW, "UTC")).toEqual({ current: 0, best: 0, wroteToday: false });
  });
});

describe("localActivity", () => {
  const input: ActivityInput = {
    now: NOW,
    timeZone: "UTC",
    documents: [
      { createdAt: at("2026-10-22T09:00:00Z") },
      { createdAt: at("2026-10-19T09:00:00Z") },
      { createdAt: at("2026-10-12T09:00:00Z") }, // previous 7-day window
      { createdAt: at("2026-08-01T09:00:00Z") },
    ],
    versions: [
      { createdAt: at("2026-10-22T09:00:00Z"), source: "AI_CREATE" },
      { createdAt: at("2026-10-22T09:30:00Z"), source: "USER_EDIT" },
      { createdAt: at("2026-10-22T10:00:00Z"), source: "PROPOSAL" },
      { createdAt: at("2026-10-19T09:00:00Z"), source: "AI_CREATE" },
      { createdAt: at("2026-10-12T17:00:00Z"), source: "USER_EDIT" },
    ],
  };

  it("counts posts drafted and revisions in the range and the window before it", () => {
    const a = localActivity(7, input);
    expect(a.postsDrafted).toEqual({ current: 2, previous: 1 });
    expect(a.revisions).toEqual({ current: 2, previous: 1 });
    expect(a.activeDays).toEqual({ current: 2, of: 7 });
  });

  it("builds a per-day series ending today, oldest first, with the previous window aligned", () => {
    const a = localActivity(7, input);
    expect(a.series.dates).toEqual(["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(a.series.current).toEqual([0, 0, 0, 1, 0, 0, 3]);
    // Previous window 9-15 Oct: one version on the 12th (index 3).
    expect(a.series.previous).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });

  it("buckets writing times by weekday (Mon first) and four-hour block in the profile's timezone", () => {
    const a = localActivity(7, input);
    // Thu 09:00-10:00 → row 3, block 8-12 (col 2): three versions. Mon 19 Oct 09:00 → row 0, col 2.
    expect(a.writingTimes[3]![2]).toBe(3);
    expect(a.writingTimes[0]![2]).toBe(1);
    expect(a.writingTimes.flat().reduce((s, n) => s + n, 0)).toBe(4);
  });

  it("is all zeros for a profile that hasn't written", () => {
    const a = localActivity(30, { now: NOW, timeZone: "UTC", documents: [], versions: [] });
    expect(a.postsDrafted).toEqual({ current: 0, previous: 0 });
    expect(a.series.current).toHaveLength(30);
    expect(a.series.current.every((n) => n === 0)).toBe(true);
    expect(a.hasWriting).toBe(false);
  });
});

describe("localAnalyticsView", () => {
  const input: ActivityInput = {
    now: NOW,
    timeZone: "UTC",
    documents: [{ createdAt: at("2026-10-22T09:00:00Z") }, { createdAt: at("2026-10-12T09:00:00Z") }],
    versions: [
      { createdAt: at("2026-10-22T09:00:00Z"), source: "AI_CREATE" },
      { createdAt: at("2026-10-22T09:30:00Z"), source: "USER_EDIT" },
      { createdAt: at("2026-10-21T20:00:00Z"), source: "USER_EDIT" },
    ],
  };

  it("turns local activity into four stat panels with honest deltas", () => {
    const v = localAnalyticsView(localActivity(7, input), { current: 2, best: 5, wroteToday: true });
    expect(v.stats.map((s) => [s.label, s.value, s.delta])).toEqual([
      ["Posts drafted", 1, "±0 vs previous 7 days"],
      ["Writing streak", 2, "Best 5 days"],
      ["Revisions", 2, "+2 vs previous 7 days"],
      ["Active days", 2, "of 7"],
    ]);
  });

  it("nudges when the streak is alive but nothing is saved today", () => {
    const v = localAnalyticsView(localActivity(7, input), { current: 1, best: 1, wroteToday: false });
    expect(v.stats[1]!.delta).toBe("Write today to keep it");
  });

  it("summarises the chart and the writing-time heatmap in words", () => {
    const v = localAnalyticsView(localActivity(7, input), { current: 2, best: 2, wroteToday: true });
    expect(v.chart.summary).toBe("Versions saved per day over the last 7 days: 3 in total, most on 22 Oct with 2. The previous 7 days had 0.");
    expect(v.chart.ticks.at(-1)?.label).toBe("22 Oct");
    expect(v.writing.peak?.label).toBe("Thu · 8 AM");
    expect(v.writing.rows).toHaveLength(7);
  });

  it("says plainly when nothing was saved", () => {
    const v = localAnalyticsView(localActivity(30, { now: NOW, timeZone: "UTC", documents: [], versions: [] }), { current: 0, best: 0, wroteToday: false });
    expect(v.chart.summary).toBe("Nothing saved in the last 30 days.");
    expect(v.stats[1]!.delta).toBe("Start one today");
    expect(v.writing.peak).toBeNull();
  });
});
