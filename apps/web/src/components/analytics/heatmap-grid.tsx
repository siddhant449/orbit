import type { CSSProperties } from "react";
import { cn } from "@brandloop/ui";
import { HEAT_STEPS, type Heatmap } from "@/lib/insights/heatmap";
import "./insights.css";

/** Wash per intensity step (system §6.16 heatmap, p09 cell alphas 0.06 → 0.6, peak full accent). */
const WASH = ["6%", "12%", "20%", "32%", "45%", "60%"];

/**
 * Heatmap grid (p09 "Best time to post"): weekday rows × time columns, stepped accent wash, the strongest cell lit.
 * The grid is decorative; `summary` carries the reading for screen readers.
 */
export function HeatmapGrid({ heatmap, summary, className }: { heatmap: Heatmap; summary: string; className?: string }) {
  return (
    <div className={className}>
      <p className="sr-only">{summary}</p>
      <div
        aria-hidden="true"
        className="grid items-center gap-1 text-[10px] text-text-3"
        style={{ gridTemplateColumns: `28px repeat(${heatmap.cols.length}, minmax(0, 1fr))` }}
      >
        <span />
        {heatmap.cols.map((c) => (
          <span key={c} className="text-center tabular-nums">
            {c}
          </span>
        ))}
        {heatmap.rows.map((row, ri) => (
          <Row key={row} label={row} cells={heatmap.cells[ri]!} />
        ))}
      </div>
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: Heatmap["cells"][number] }) {
  return (
    <>
      <span>{label}</span>
      {cells.map((c, i) => (
        <span
          key={i}
          data-step={c.step}
          className={cn("insights-cell", c.peak && "insights-peak")}
          style={{ "--heat": WASH[Math.min(c.step, HEAT_STEPS - 1)] } as CSSProperties}
        />
      ))}
    </>
  );
}
