"use client";

import Link from "next/link";
import { useState } from "react";
import { Segmented, cn, pillClass } from "@brandloop/ui";
import type { AnalyticsView } from "@/lib/insights/analytics-view";
import type { Range } from "@/lib/insights/local-activity";
import { ConnectionStatus } from "./connect-linkedin";
import { HeatmapGrid } from "./heatmap-grid";
import { LineChart } from "./line-chart";
import { StatPanel } from "./stat-panel";

export const RANGE_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

/** Header row (p09): title + status on the left; range, then actions, on the right. */
export function AnalyticsHeader({ status, range, onRange, actions }: { status: React.ReactNode; range: Range; onRange: (r: Range) => void; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="type-page-title text-text focus-visible:outline-none">Analytics</h1>
        {status}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <Segmented label="Range" options={RANGE_OPTIONS} value={String(range) as "7" | "30" | "90"} onChange={(v) => onRange(Number(v) as Range)} />
        {actions}
      </div>
    </div>
  );
}

const chip = cn(pillClass(), "!min-h-8 text-xs");

function downloadCsv(view: AnalyticsView) {
  const rows = [["date", "impressions", "previous_period"], ...view.chart.dates.map((d, i) => [d, view.chart.current[i], view.chart.previous[i]])];
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orbit-analytics-${view.range}d.csv`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the download has started; revoking synchronously can cancel it in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Analytics, LinkedIn connected (screens.md B7, p09 / p22). Driven entirely by `views` (one per range, built from the
 * LinkedIn statistics sync); nothing here is sample data. The page renders `AnalyticsOffline` until LinkedIn is
 * connected.
 */
export function AnalyticsDashboard({ views, initialRange = 30 }: { views: Partial<Record<Range, AnalyticsView>>; initialRange?: Range }) {
  const [range, setRange] = useState<Range>(initialRange);
  const [compare, setCompare] = useState(true);
  const view = views[range] ?? views[30] ?? Object.values(views)[0];
  if (!view) return null;

  return (
    <div className="flex flex-col gap-5">
      <AnalyticsHeader
        status={<ConnectionStatus connected>{view.status}</ConnectionStatus>}
        range={range}
        onRange={setRange}
        actions={
          <>
            <Link href="/engage?view=leads" className={chip}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-text" />
              {view.whoEngaged}
            </Link>
            <button type="button" className={pillClass({ selected: compare, className: "!min-h-8 text-xs" })} aria-pressed={compare} onClick={() => setCompare((c) => !c)}>
              Compare
            </button>
            <button type="button" className={chip} onClick={() => downloadCsv(view)}>
              Export CSV
            </button>
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        {view.stats.map((s) => (
          <StatPanel
            key={s.key}
            label={s.label}
            value={s.value}
            decimals={s.decimals}
            suffix={s.suffix}
            delta={{ text: s.delta.text, tone: s.key === "engagement-rate" ? "soft" : "mono" }}
            sessionKey={`analytics:${s.key}:${view.range}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <section aria-labelledby="impressions-h" className="orbit-panel flex min-w-0 flex-[1_1_560px] flex-col gap-4 self-start !rounded-[20px] px-6 py-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="impressions-h" className="text-sm font-medium text-text">
              Impressions over time
            </h2>
            <Legend showPrevious={compare} />
          </div>
          <LineChart current={view.chart.current} previous={view.chart.previous} showPrevious={compare} ticks={view.chart.ticks} summary={view.chart.summary} />
        </section>

        <div className="flex min-w-[min(280px,100%)] flex-[0_1_360px] flex-col gap-3">
          <section aria-labelledby="top-posts-h" className="orbit-panel flex flex-1 flex-col gap-1.5 !rounded-[20px] px-2 pb-2 pt-[18px]">
            <h2 id="top-posts-h" className="px-3 pb-1.5 text-sm font-medium text-text">
              Top posts
            </h2>
            {view.topPosts.length === 0 ? (
              <p className="px-3 pb-3 text-[13px] text-text-2">No posts published in this range.</p>
            ) : (
              <ol className="flex flex-col">
                {view.topPosts.map((p, i) => (
                  <li key={p.id}>
                    <TopPostRow post={p} lead={i === 0} />
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-labelledby="best-time-h" className="orbit-panel flex flex-col gap-3 !rounded-[20px] px-5 py-[18px]">
            <div className="flex items-center justify-between">
              <h2 id="best-time-h" className="text-sm font-medium text-text">
                Best time to post
              </h2>
              {view.bestTime.peak && <span className="text-xs text-text-2">{view.bestTime.peak.label}</span>}
            </div>
            <HeatmapGrid
              heatmap={view.bestTime}
              summary={view.bestTime.peak ? `Posts published ${view.bestTime.peak.label} got the most engagement.` : "Not enough posts yet to find a best time."}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export function Legend({ showPrevious = true, current = "This period", previous = "Previous" }: { showPrevious?: boolean; current?: string; previous?: string }) {
  return (
    <span className="flex gap-3.5 text-xs text-text-2">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="block h-0.5 w-3.5 bg-accent-text" />
        {current}
      </span>
      {showPrevious && (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="block h-0.5 w-3.5 bg-line-control" />
          {previous}
        </span>
      )}
    </span>
  );
}

function TopPostRow({ post, lead }: { post: AnalyticsView["topPosts"][number]; lead: boolean }) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate text-[13px] font-medium text-text">{post.title}</span>
        <span className="text-[11px] text-text-3">{post.meta}</span>
      </span>
      <span className={cn("font-display text-lg font-medium tracking-[-0.03em] tabular-nums", lead ? "text-accent-text" : "text-text")}>
        <span className="sr-only">Impressions: </span>
        {post.value}
      </span>
    </>
  );
  const row = "flex items-center justify-between gap-3 rounded-[12px] px-3 py-2.5";
  if (!post.href) return <div className={row}>{body}</div>;
  const external = post.href.startsWith("http");
  return (
    <Link
      href={post.href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn(row, "orbit-transition hover:bg-line-soft")}
    >
      {body}
    </Link>
  );
}
