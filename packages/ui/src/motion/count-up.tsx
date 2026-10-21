"use client";

import { useEffect, useRef, useState } from "react";
import { cinematic } from "./presets";
import { useReducedMotionPref } from "./use-media";

/**
 * A number that counts up to its value on mount and whenever it changes (D4): 420 ms, eased, tabular numerals. The
 * final value is rendered within the first frame under reduced motion and reached within the tween otherwise.
 */
export function CountUp({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const reduced = useReducedMotionPref();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    const ms = cinematic.count * 1000;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const next = Math.round(begin + (value - begin) * e);
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {shown}
      {suffix}
    </span>
  );
}
