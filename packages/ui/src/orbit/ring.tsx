import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";

/** Geometry in a 100-unit viewBox: radius leaves one unit outside the stroke; C = 2πr; offset = C × (1 − value/max). */
export function ringGeometry({ value, max, strokeWidth = 6 }: { value: number; max: number; strokeWidth?: number }) {
  const r = 50 - strokeWidth / 2 - 1;
  const c = 2 * Math.PI * r;
  const progress = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return { r, c, offset: c * (1 - progress) };
}

/**
 * Progress ring (system §6.7): `line-2` track, `accent-text` arc with a round cap, starting at 12 o'clock. The arc
 * draws from empty to its value on first view (1.6 s out-expo after .5 s, CSS); reduced motion shows the final arc.
 * `role="img"` named "<label>, <value> of <max>"; centred children (the day number) are part of the picture.
 */
export function Ring({
  value,
  max,
  size = 52,
  strokeWidth = 6,
  label,
  children,
  className,
}: {
  value: number;
  max: number;
  /** Rendered size in px. */
  size?: number;
  /** Stroke width in viewBox units (the viewBox is 100). */
  strokeWidth?: number;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const { r, c, offset } = ringGeometry({ value, max, strokeWidth });
  return (
    <span
      role="img"
      aria-label={`${label}, ${value} of ${max}`}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="absolute inset-0">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line-2)" strokeWidth={strokeWidth} />
        <circle
          data-ring-bar=""
          className="orbit-ring__bar"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ "--ring-c": c } as CSSProperties}
        />
      </svg>
      {children !== undefined && (
        <span aria-hidden="true" className="relative font-display text-[0.5em] font-medium tabular-nums text-text">
          {children}
        </span>
      )}
    </span>
  );
}
