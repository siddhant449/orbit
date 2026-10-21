"use client";

import { useEffect, useState } from "react";

/** True once the browser has had an idle moment after mount: used to mount lazily loaded effects (ruling U10). */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback; cancelIdleCallback?: typeof cancelIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(done, { timeout: 1200 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const id = window.setTimeout(done, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);
  return ready;
}
