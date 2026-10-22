"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusPill } from "@brandloop/ui";
import type { LocalActivity, Range, Streak } from "@/lib/insights/local-activity";
import { localAnalyticsView } from "@/lib/insights/local-view";
import { AnalyticsHeader, Legend } from "./analytics-dashboard";
import { ConnectLinkedIn, ConnectionStatus } from "./connect-linkedin";
import { HeatmapGrid } from "./heatmap-grid";
import { LineChart } from "./line-chart";
import { StatPanel } from "./stat-panel";

/** What the connected screen adds, named so the empty panel says exactly what will appear (p09 panels). */
const LINKEDIN_METRICS = ["Impressions", "Reach", "Engagement rate", "New followers", "Top posts", "Best time to post"];


/**
 * Analytics before LinkedIn is connected (screens.md B7, ruling A14). Orbit's p09 layout with only real numbers:
 * the stat row, chart and heatmap count what the profile drafted in Orbit; LinkedIn's statistics are named, not
 * invented, beside a "Connect LinkedIn" pill.
 */
export function AnalyticsOffline({ byRange, streak }: { byRange: Record<Range, LocalActivity>; streak: Streak }) {
  const [range, setRange] = useState<Range>(30);
  const view = localAnalyticsView(byRange[range], streak);
  const wrote = byRange[90].hasWriting || streak.best > 0;

  return (
    <div className="flex flex-col gap-5">
      <AnalyticsHeader
        status={
          <ConnectionStatus connected={false}>
            LinkedIn not connected
            <StatusPill className="!min-h-5 px-2">From your drafts in Orbit</StatusPill>
          </ConnectionStatus>
        }
        range={range}
        onRange={setRange}
        actions={<ConnectLinkedIn />}
      />

      <section aria-label="Your writing in Orbit" className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
        {view.stats.map((s) => (
          <StatPanel key={s.key} label={s.label} value={s.value} delta={{ text: s.delta }} sessionKey={`analytics-local:${s.key}:${range}`} />
        ))}
      </section>

      <div className="flex flex-wrap gap-3">
        <section aria-labelledby="activity-h" className="orbit-panel flex min-w-0 flex-[1_1_560px] flex-col gap-4 self-start !rounded-[20px] px-5 py-5 md:px-6 md:py-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="activity-h" className="text-sm font-medium text-text">
              Drafting activity
            </h2>
            <Legend />
          </div>
          <LineChart current={view.chart.current} previous={view.chart.previous} ticks={view.chart.ticks} summary={view.chart.summary} />
          {!wrote && (
            <p className="text-[13px] text-text-2">
              Nothing saved yet. Every draft and edit you save shows up here, including drafts you later delete.{" "}
              <Link href="/" className="text-accent-text underline-offset-4 hover:underline">
                Start a draft
              </Link>
            </p>
          )}
        </section>

        <div className="flex min-w-[min(280px,100%)] flex-[0_1_360px] flex-col gap-3">
          <section
            aria-labelledby="connect-h"
            className="orbit-panel flex flex-1 flex-col items-start gap-4 !rounded-[20px] !border-[var(--accent-wash-line)] p-5"
          >
            <div className="flex flex-col gap-2">
              <h2 id="connect-h" className="type-card-title text-text">
                See how your posts land
              </h2>
              <p className="text-[13px] leading-[1.55] text-text-2">
                Coming later: once LinkedIn approves Orbit&apos;s access to member post analytics, connecting your account
                will fill this page with your post and follower statistics from LinkedIn&apos;s official API, visible only to
                you.
              </p>
            </div>
            <ul aria-label="Appears once LinkedIn access is approved and connected" className="flex w-full flex-col">
              {LINKEDIN_METRICS.map((m) => (
                <li key={m} className="flex items-center justify-between border-b border-line py-2 text-[13px] text-text-soft last:border-0">
                  {m}
                  <span aria-hidden="true" className="h-px w-6 bg-line-4" />
                </li>
              ))}
            </ul>
            <ConnectLinkedIn size="sm" />
          </section>

          <section aria-labelledby="writing-h" className="orbit-panel flex flex-col gap-3 !rounded-[20px] px-5 py-[18px]">
            <div className="flex items-center justify-between gap-3">
              <h2 id="writing-h" className="text-sm font-medium text-text">
                Versions saved, by time
              </h2>
              {view.writing.peak && <span className="text-xs text-text-2">{view.writing.peak.label}</span>}
            </div>
            <HeatmapGrid
              heatmap={view.writing}
              summary={view.writing.peak ? `Most versions saved: ${view.writing.peak.label}.` : "Not enough versions saved in this range to show a pattern."}
            />
            <p className="text-[11px] leading-[1.5] text-text-3">
              {view.writing.peak
                ? "Each cell counts versions you saved in that four-hour block. Best time to post replaces this once LinkedIn analytics are connected."
                : "Not enough saves yet to show a pattern. Each cell counts versions you saved in that four-hour block."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
