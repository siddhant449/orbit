"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

/** The animation features arrive in their own chunk; `m.*` components render their initial frame until then. */
export const loadMotionFeatures = () => import("./features").then((mod) => mod.default);

/**
 * App-root motion context: `m.*` components only, features loaded lazily after first paint (ruling U7), and
 * `reducedMotion="user"` so transform animations are dropped when the OS asks for reduced motion
 * (micro-interactions.md section 0).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
