"use client";

import type { ReactNode } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * App-root motion context: `m.*` components only, features loaded through `domAnimation`, and
 * `reducedMotion="user"` so transform animations are dropped when the OS asks for reduced motion
 * (micro-interactions.md section 0).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
