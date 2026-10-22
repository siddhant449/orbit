import { CountUp, StatusPill, cn } from "@brandloop/ui";

/**
 * Stat panel (system §6.8, p09): `13px text-2` label, the number in `stat` (Bricolage 44), then a delta pill in the
 * data register. The number counts up once per session (`sessionKey`); reduced motion and screen readers get the
 * final value.
 */
export function StatPanel({
  label,
  value,
  decimals = 0,
  suffix = "",
  delta,
  sessionKey,
  className,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  /** Mono pill under the number ("+41.6% vs previous 30 days"); `soft` is the filled variant p09 uses for points. */
  delta?: { text: string; tone?: "mono" | "soft" } | null;
  sessionKey: string;
  className?: string;
}) {
  const scale = 10 ** decimals;
  return (
    <div className={cn("orbit-panel flex min-w-0 flex-col items-start gap-3.5 p-5", className)}>
      <span className="text-[13px] text-text-2">{label}</span>
      <CountUp
        value={Math.round(value * scale)}
        format={(n) => (n / scale).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        suffix={suffix}
        sessionKey={sessionKey}
        className="type-stat !text-[44px] !leading-none text-text"
      />
      {delta &&
        (delta.tone === "soft" ? (
          <span className="inline-flex min-h-7 items-center rounded-pill bg-line px-2.5 text-xs font-medium text-text-soft">{delta.text}</span>
        ) : (
          <StatusPill tone="mono">{delta.text}</StatusPill>
        ))}
    </div>
  );
}
