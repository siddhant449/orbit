import { describe, expect, it } from "vitest";
import { buildAnalyticsView, shortDate, type AnalyticsSnapshot } from "./analytics-view";

// Fixture in tests only: the connected-state screen must never render these on the real page (ruling A14).
function snapshot(over: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 22 + i));
    return { date: d.toISOString().slice(0, 10), impressions: 1000 + i * 100, previous: 800 + i * 50 };
  });
  return {
    range: 30,
    refreshedAt: "2026-10-22T10:00:00Z",
    metrics: {
      impressions: { current: 1_842_310, previous: 1_301_066 },
      reach: { current: 296_540, previous: 244_267 },
      engagementRate: { current: 0.052, previous: 0.049 },
      newFollowers: { current: 1_640, previous: 1_028 },
    },
    daily: days,
    topPosts: [
      { id: "p2", title: "Second", reactions: 388, comments: 71, impressions: 15_200, documentId: null, url: "https://www.linkedin.com/feed/update/urn:li:activity:2" },
      { id: "p1", title: "First", reactions: 612, comments: 148, impressions: 28_400, documentId: "doc_1", url: null },
      { id: "p3", title: "Third", reactions: 241, comments: 44, impressions: 9_800, documentId: null, url: null },
      { id: "p4", title: "Fourth", reactions: 1, comments: 0, impressions: 10, documentId: null, url: null },
    ],
    postingTimes: [
      [1, 3, 5, 2, 1, 0],
      [2, 6, 9, 3, 1, 0],
      [1, 4, 5, 3, 1, 0],
      [1, 3, 4, 2, 1, 0],
      [1, 2, 3, 1, 0, 0],
    ],
    whoEngaged: 212,
    ...over,
  };
}

const NOW = new Date("2026-10-22T12:00:00Z");

describe("shortDate", () => {
  it("formats a day key as '6 Oct'", () => {
    expect(shortDate("2026-10-06")).toBe("6 Oct");
  });
});

describe("buildAnalyticsView", () => {
  it("states the connection honestly with the refresh age", () => {
    expect(buildAnalyticsView(snapshot(), NOW).status).toBe("LinkedIn connected · official API · refreshed 2h ago");
  });

  it("formats the four stat panels with their deltas", () => {
    const v = buildAnalyticsView(snapshot(), NOW);
    expect(v.stats.map((s) => [s.label, s.display, s.delta.text])).toEqual([
      ["Impressions", "1,842,310", "+41.6% vs previous 30 days"],
      ["Reach", "296,540", "+21.4%"],
      ["Engagement rate", "5.2%", "+0.3 pts"],
      ["New followers", "1,640", "+612"],
    ]);
    expect(v.stats[2]!.value).toBeCloseTo(5.2);
  });

  it("ranks top posts by impressions, keeps three, and links to the draft or the LinkedIn post", () => {
    const v = buildAnalyticsView(snapshot(), NOW);
    expect(v.topPosts.map((p) => [p.title, p.value, p.meta, p.href])).toEqual([
      ["First", "28.4k", "612 reactions · 148 comments", "/posts/doc_1"],
      ["Second", "15.2k", "388 reactions · 71 comments", "https://www.linkedin.com/feed/update/urn:li:activity:2"],
      ["Third", "9.8k", "241 reactions · 44 comments", null],
    ]);
  });

  it("builds the chart series, five date ticks and a text summary", () => {
    const v = buildAnalyticsView(snapshot(), NOW);
    expect(v.chart.current).toHaveLength(30);
    expect(v.chart.dates[0]).toBe("2026-09-22");
    expect(v.chart.ticks.map((t) => t.label)).toEqual(["22 Sep", "29 Sep", "7 Oct", "14 Oct", "21 Oct"]);
    expect(v.chart.summary).toBe(
      "Impressions over the last 30 days: 73,500 in total, highest on 21 Oct with 3,900. The previous 30 days had 45,750.",
    );
  });

  it("finds the best time to post from the weekday × hour grid", () => {
    const v = buildAnalyticsView(snapshot(), NOW);
    expect(v.bestTime.peak?.label).toBe("Tue · 10 AM");
    expect(v.bestTime.rows).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("labels the who-engaged pill and the range", () => {
    const v = buildAnalyticsView(snapshot({ range: 7 }), NOW);
    expect(v.whoEngaged).toBe("Who engaged · 212");
    expect(v.stats[0]!.delta.text).toBe("+41.6% vs previous 7 days");
  });
});
