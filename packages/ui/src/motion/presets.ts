import { useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";

/** Motion presets, named once (docs/design/micro-interactions.md section 0). */

/** `ease-ink`: hovers, reveals, sweeps. */
export const easeInk = [0.2, 0.7, 0.2, 1] as const;
/** `ease-exit`: exits and dismissals. */
export const easeExit = [0.4, 0, 0.8, 0.4] as const;

/** `spring-press`: press and release (settles in about 150 ms). */
export const springPress = { type: "spring", stiffness: 500, damping: 30, mass: 1 } as const;
/** `spring-layout`: `layout` and `layoutId` moves (about 300 ms). */
export const springLayout = { type: "spring", stiffness: 380, damping: 36 } as const;

/** Durations in seconds: hover 200 ms, entry 180 ms, exit 120 ms, draw 400 ms, settle 240 ms, loader loop 1.2 s. */
export const durations = { hover: 0.2, entry: 0.18, exit: 0.12, draw: 0.4, settle: 0.24, loop: 1.2 } as const;

/** `stamp`: entries of plates, dialogs, toasts and routes (180 ms `ease-ink`; exit is opacity only). */
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
