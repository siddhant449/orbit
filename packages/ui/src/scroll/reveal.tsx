"use client";

import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cinematic, easeInk } from "../motion/presets";

/**
 * Scroll-driven reveal (C8) for content below the fold: fades and lifts 12 px once, when 20 % of it is in view.
 * `index` staggers siblings by 40 ms. Not for first-fold content or lists over 20 rows. Under reduced motion the
 * content renders in place.
 */
export function Reveal({ children, index = 0, className }: { children: ReactNode; index?: number; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -32px 0px" }}
      transition={{ duration: cinematic.reveal, ease: easeInk, delay: index * cinematic.revealStagger }}
    >
      {children}
    </m.div>
  );
}
