import { useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";

/** Orbit motion tokens (docs/design/orbit/system.md section 7.1). Durations and staggers in seconds, distances in px. */

/** One easing everywhere: out-expo, `cubic-bezier(.16,1,.3,1)`. */
export const easeOut = [0.16, 1, 0.3, 1] as const;

/** Hover colour 150 ms, hover transforms 400 ms, fade-rise reveals 900 ms, headline lines / draws / count-up 1.2 s. */
export const durations = { hoverColor: 0.15, hover: 0.4, reveal: 0.9, line: 1.2 } as const;

/** Between headline lines; between panels. */
export const stagger = { line: 0.08, panel: 0.12 } as const;

/** Button lift, panel/tile lift (marketing; the app lifts panels 3 px), reveal rise. */
export const distance = { button: 2, panel: 8, reveal: 18 } as const;

/** Magnetic CTAs (marketing only). */
export const springMagnet = { type: "spring", stiffness: 300, damping: 24 } as const;
/** `layout` and `layoutId` moves: sidebar indicator, segmented pill. */
export const springLayout = { type: "spring", stiffness: 380, damping: 36 } as const;

/* ------------------------------------------------------------------------------------------------------------------
 * Deprecated Drafting names, kept so un-migrated screens compile. Removed in O4 (migration §1.1).
 * ---------------------------------------------------------------------------------------------------------------- */

/** @deprecated use `easeOut`. */
export const easeInk = easeOut;
/** @deprecated exits use opacity with `easeOut`. */
export const easeExit = [0.4, 0, 0.8, 0.4] as const;
/** @deprecated press is CSS `scale(0.98)` for 150 ms. */
export const springPress = { type: "spring", stiffness: 500, damping: 30, mass: 1 } as const;
/** @deprecated use `durations`, `stagger` and `distance`. */
export const cinematic = {
  set: 0.42,
  setStagger: 0.022,
  land: { type: "spring", stiffness: 320, damping: 26 } as const,
  stamp: 0.18,
  stampStagger: 0.06,
  roll: 0.26,
  reveal: durations.reveal,
  revealStagger: 0.04,
  count: durations.line,
  draw: 0.7,
} as const;
/** @deprecated overlays fade with `easeOut`. */
export const stampVariants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0 },
} as const satisfies Variants;

/**
 * True when motion is allowed, false when the user prefers reduced motion.
 * Wraps `useReducedMotion`; the server render reports "allowed", so do not branch markup on it before mount.
 */
export function useMotionSafe(): boolean {
  return !useReducedMotion();
}
