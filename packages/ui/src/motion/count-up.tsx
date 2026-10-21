"use client";

import { useEffect, useRef, useState } from "react";
import { durations } from "./presets";
import { useReducedMotionPref } from "./use-media";

const SEEN_PREFIX = "brandloop:count-up:";

/**
 * Whether a keyed metric has already counted up in this session; marks it seen. Numbers count up only on the first
 * visit per session (system §6.8, p31). Without sessionStorage every view counts as the first.
 */
export function countUpSeen(key: string): boolean {
  try {
    const k = SEEN_PREFIX + key;
    if (sessionStorage.getItem(k)) return true;
    sessionStorage.setItem(k, "1");
  } catch {
    // Storage blocked: animate.
  }
  return false;
}

const outExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/**
 * A number that counts up to its value over 1.2 s, out-expo, tabular numerals. With `sessionKey` it counts from zero
 * only on the first view of that metric per session; later mounts show the value. A changed value tweens from the
 * previous one. The final string is in the DOM (visually hidden) for screen readers; the animated copy is
 * `aria-hidden`. Reduced motion shows the final value.
 */
export function CountUp({
  value,
  suffix = "",
  sessionKey,
  format = String,
  className,
}: {
  value: number;
  suffix?: string;
  sessionKey?: string;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotionPref();
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);

  useEffect(() => {
    let begin = from.current ?? value;
    if (from.current === null && sessionKey && !countUpSeen(sessionKey)) begin = 0;
    if (reduced || begin === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const ms = durations.line * 1000;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setShown(Math.round(begin + (value - begin) * outExpo(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    from.current = value;
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, sessionKey]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }} aria-live="off">
      <span className="sr-only">
        {format(value)}
        {suffix}
      </span>
      <span aria-hidden="true">
        {format(shown)}
        {suffix}
      </span>
    </span>
  );
}
