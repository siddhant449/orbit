"use client";

import { AnimatePresence, m } from "motion/react";
import { cinematic, easeInk } from "@brandloop/ui";

/**
 * The printed index (C7): the current or hovered page name set huge in Archivo 125 at the foot of the sidebar and
 * clipped by its edge, like a running head. Swaps by a vertical roll. Decorative, so hidden from assistive tech.
 */
export function IndexLabel({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className="index-label">
      <AnimatePresence initial={false}>
        <m.span
          key={label}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "-100%" }}
          transition={{ duration: cinematic.roll, ease: easeInk }}
        >
          {label}
        </m.span>
      </AnimatePresence>
    </div>
  );
}
