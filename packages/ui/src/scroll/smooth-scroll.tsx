"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import { cancelFrame, frame } from "motion/react";

const options = {
  lerp: 0.12,
  duration: 1.1,
  smoothWheel: true,
  syncTouch: false,
  autoRaf: false,
  anchors: true,
  autoResize: true,
} as const;

/**
 * Lenis in wrapper mode (micro-interactions.md section 6): the rendered wrapper is the scroll container, so pass the
 * sizing classes (`min-h-0 flex-1 overflow-y-auto`). One frame loop only: Lenis is driven from Motion's `frame`.
 * `respectReducedMotion` (default true) turns smoothing off live under `prefers-reduced-motion`.
 */
export function SmoothScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<LenisRef>(null);
  useEffect(() => {
    const update = (data: { timestamp: number }) => ref.current?.lenis?.raf(data.timestamp);
    frame.update(update, true);
    return () => cancelFrame(update);
  }, []);
  return (
    <ReactLenis ref={ref} className={className} options={options}>
      {children}
    </ReactLenis>
  );
}
