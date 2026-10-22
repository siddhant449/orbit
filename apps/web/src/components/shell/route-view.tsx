"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@brandloop/ui";
import { handoffFade, SKELETON_DELAY_MS } from "./route-view-logic";

/** Set once the first screen of this page load has mounted: every later `RouteView` mount is a client navigation. */
let booted = false;

/**
 * The main region's page wrapper (`(app)/template.tsx`, so it mounts once per navigation). After a client navigation
 * the new screen fades in over 180 ms (`.route-view--enter`, opacity only: nothing moves, so focus, scroll and the docked
 * composer stay put, and nothing waits for it). A hard load keeps its own first-paint entrance instead. When a loading
 * skeleton was on screen, the content that replaces it fades in as well, so skeleton to content reads as one handoff
 * rather than a pop. Nothing replays on tab return: the fade only runs on mount.
 */
export function RouteView({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Read at first render (StrictMode's second render sees the same value: the flag is only set in an effect).
  const [enter] = useState(() => booted);
  useEffect(() => {
    booted = true;
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const skeleton = () => el.querySelector(":scope > [data-route-loading]");
    let shownAt: number | null = skeleton() ? performance.now() : null;
    const mo = new MutationObserver(() => {
      const loading = skeleton();
      if (loading && shownAt === null) shownAt = performance.now();
      else if (!loading && shownAt !== null) {
        const fade = handoffFade(performance.now() - shownAt, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        shownAt = null;
        if (fade) el.animate(fade.keyframes, fade.options);
      }
    });
    // A loading boundary renders no DOM of its own, so its skeleton is always a direct child: no subtree watch.
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-route-view=""
      className={cn("route-view", enter && "route-view--enter")}
      style={{ ["--skeleton-delay" as string]: `${SKELETON_DELAY_MS}ms` }}
    >
      {children}
    </div>
  );
}
