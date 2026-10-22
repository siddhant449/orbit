import { useId } from "react";
import { cn } from "@brandloop/ui";
import { chartGeometry } from "@/lib/insights/chart";
import "./insights.css";

const W = 760;
const H = 240;

/**
 * Line chart (system §6.16, p09): this period in `accent-text` with a soft glow and gradient area, the previous
 * period as a thin `line-hover` line, three hairline gridlines, a ringed marker on the peak, date ticks underneath.
 * `summary` is the text alternative (the SVG is `role="img"`).
 */
export function LineChart({
  current,
  previous,
  ticks,
  summary,
  showPrevious = true,
  className,
}: {
  current: number[];
  previous?: number[];
  ticks: { index: number; label: string }[];
  summary: string;
  showPrevious?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const g = chartGeometry({ current, previous: showPrevious ? previous : undefined, width: W, height: H });
  const n = current.length;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent-text)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent-text)" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g stroke="var(--line-row)" strokeWidth="1">
          {[60, 120, 180].map((y) => (
            <line key={y} x1="0" y1={y} x2={W} y2={y} />
          ))}
        </g>
        {g.previous && (
          <path d={g.previous.line} fill="none" stroke="var(--line-hover)" strokeWidth="1.5" data-series="previous" />
        )}
        <path className="insights-area" d={g.current.area} fill={`url(#fill-${id})`} />
        <path
          className="insights-line"
          d={g.current.line}
          pathLength={1}
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
         
          filter={`url(#glow-${id})`}
          data-series="current"
        />
        {g.peak && (
          <circle className="insights-marker" cx={g.peak.x} cy={g.peak.y} r="5" fill="var(--ground)" stroke="var(--accent-text)" strokeWidth="2.5" />
        )}
      </svg>
      <div aria-hidden="true" className="relative flex h-4 text-[11px] text-text-3">
        {ticks.map((t, i) => (
          <span
            key={t.index}
            className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")}
            style={{ left: `${n > 1 ? (t.index / (n - 1)) * 100 : 50}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
