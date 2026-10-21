"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Live media query. The server (and the first client render) report `false`, so callers must treat that as
 * "not yet known" and never render something on the server that only this hook can switch off.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches) || false,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** True once the browser reports `prefers-reduced-motion: reduce`; false on the server. */
export function useReducedMotionPref(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}
