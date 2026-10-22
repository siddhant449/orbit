import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";
import { buildAnalyticsView, type AnalyticsSnapshot } from "@/lib/insights/analytics-view";
import { localActivity, RANGES, writingStreak, type LocalActivity, type Range } from "@/lib/insights/local-activity";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}));

const { AnalyticsDashboard } = await import("./analytics-dashboard");
const { AnalyticsOffline } = await import("./analytics-offline");

const NOW = new Date("2026-10-22T12:00:00Z");

// Connected-state fixture: tests only (ruling A14).
const SNAPSHOT: AnalyticsSnapshot = {
  range: 30,
  refreshedAt: "2026-10-22T10:00:00Z",
  metrics: {
    impressions: { current: 52_000, previous: 40_000 },
    reach: { current: 9_100, previous: 8_000 },
    engagementRate: { current: 0.041, previous: 0.038 },
    newFollowers: { current: 120, previous: 80 },
  },
  daily: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 23 + i)).toISOString().slice(0, 10),
    impressions: 1000 + i * 20,
    previous: 900,
  })),
  topPosts: [{ id: "t1", title: "Fixture post title", reactions: 40, comments: 9, impressions: 4_200, documentId: "doc_x", url: null }],
  postingTimes: [
    [0, 1, 2, 0, 0, 0],
    [0, 0, 5, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ],
  whoEngaged: 33,
};

// Orbit's artboard numbers and names: never on any page (ruling A14).
const ARTBOARD = ["1,842,310", "296,540", "Why we killed the free tier", "Who engaged · 212", "28.4k", "Sample data"];

describe("AnalyticsDashboard (connected)", () => {
  const html = renderToStaticMarkup(<AnalyticsDashboard views={{ 30: buildAnalyticsView(SNAPSHOT, NOW) }} />);

  it("renders the status line, stats, chart, top posts and best time from the view model", () => {
    expect(html).toContain("LinkedIn connected · official API · refreshed 2h ago");
    expect(html).toContain("52,000");
    expect(html).toContain("+30% vs previous 30 days");
    expect(html).toContain("4.1%");
    expect(html).toContain("Impressions over time");
    expect(html).toContain('role="img"');
    expect(html).toContain("Fixture post title");
    expect(html).toContain('href="/posts/doc_x"');
    expect(html).toContain("Tue · 10 AM");
    expect(html).toContain("Who engaged · 33");
    expect(html).toContain("Export CSV");
  });

  it("carries no artboard sample data", () => {
    for (const s of ARTBOARD) expect(html).not.toContain(s);
  });
});

function offline(versions: { createdAt: Date; source: string }[], documents: { createdAt: Date }[]) {
  const input = { now: NOW, timeZone: "UTC", documents, versions };
  const byRange = Object.fromEntries(RANGES.map((r) => [r, localActivity(r, input)])) as Record<Range, LocalActivity>;
  return renderToStaticMarkup(<AnalyticsOffline byRange={byRange} streak={writingStreak(versions.map((v) => v.createdAt), NOW, "UTC")} />);
}

describe("AnalyticsOffline (not connected)", () => {
  it("says LinkedIn isn't connected, links to integrations and shows no LinkedIn numbers", () => {
    const html = offline([], []);
    expect(html).toContain("LinkedIn not connected");
    expect(html).toContain('href="/settings/integrations"');
    expect(html).toContain("Connect LinkedIn");
    expect(html).toContain("See how your posts land");
    expect(html).not.toContain("LinkedIn connected ·");
    expect(html).toContain("Nothing saved in the last 30 days.");
    expect(html).toContain("Start a draft");
    for (const s of ARTBOARD) expect(html).not.toContain(s);
  });

  it("shows the profile's real drafting numbers", () => {
    const html = offline(
      [
        { createdAt: new Date("2026-10-22T09:00:00Z"), source: "AI_CREATE" },
        { createdAt: new Date("2026-10-21T09:00:00Z"), source: "USER_EDIT" },
      ],
      [{ createdAt: new Date("2026-10-21T09:00:00Z") }],
    );
    expect(html).toContain("Posts drafted");
    expect(html).toContain("Writing streak");
    expect(html).toMatch(/Writing streak<\/span><span[^>]*><span class="sr-only">2</);
    expect(html).toContain("Versions saved per day over the last 30 days: 2 in total");
    expect(html).not.toContain("Start a draft");
  });
});
