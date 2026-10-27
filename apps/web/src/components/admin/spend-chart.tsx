import { cn } from "@brandloop/ui";
import { featureLabel, usd, type ChartData } from "@/lib/admin-format";
import "./admin.css";

const W = 760;
const H = 220;
const GAP = 3;

/**
 * Daily AI cost as stacked bars (one per UTC day, split by the biggest features). Server-rendered SVG with no script:
 * each bar has a <title> tooltip, and `summary` is the text alternative for the whole chart.
 */
export function SpendChart({ data, className }: { data: ChartData; className?: string }) {
  const n = data.days.length;
  const bar = (W - GAP * (n - 1)) / n;
  const scale = data.max > 0 ? (H * 0.92) / data.max : 0;
  const color = (feature: string) => `var(--s${Math.min(data.legend.indexOf(feature) + 1, 6)})`;
  const last = data.days.at(-1);
  const summary = `Daily AI cost for the last ${n} days, ${usd(data.total)} in total${last ? `, ${usd(last.total)} today` : ""}.`;
  const ticks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className={cn("admin-chart flex flex-col gap-4", className)} data-chart="spend">
      <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible">
        <g stroke="var(--line-row)" strokeWidth="1">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} />
          ))}
          <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line-3)" />
        </g>
        {data.days.map((d, i) => {
          let y = H;
          return (
            <g key={d.day} data-day={d.day}>
              <title>{`${d.label}: ${usd(d.total)}${d.parts.map((p) => `\n${featureLabel(p.feature)} ${usd(p.micro)}`).join("")}`}</title>
              {/* A full-height hit area so empty days still show their tooltip. */}
              <rect x={i * (bar + GAP)} y={0} width={bar} height={H} fill="transparent" />
              {d.parts.map((p) => {
                const h = Math.max(1.5, p.micro * scale);
                y -= h;
                return <rect key={p.feature} data-bar={p.feature} x={i * (bar + GAP)} y={y} width={bar} height={h} rx={1.5} fill={color(p.feature)} />;
              })}
            </g>
          );
        })}
      </svg>
      <div aria-hidden="true" className="relative flex h-4 text-[11px] text-text-3">
        {ticks.map((t, i) => (
          <span key={t} className={cn("absolute whitespace-nowrap", i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${n > 1 ? (t / (n - 1)) * 100 : 50}%` }}>
            {data.days[t]?.label}
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-text-2" aria-label="Chart legend">
        {data.legend.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: color(f) }} />
            {featureLabel(f)}
          </li>
        ))}
      </ul>
    </div>
  );
}
