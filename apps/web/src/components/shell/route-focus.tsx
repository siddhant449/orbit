"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * After a client-side route change, focus moves to the new page's `h1` (or the main landmark), so keyboard and
 * screen-reader users land on the new content. Routes switch instantly; this only moves focus. The first client
 * navigation also marks `<html data-navigated>`, which stops first-paint entrance motion (line reveals, card rises)
 * from replaying on later screens (system §7.3).
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  const seen = useRef<string | null>(null);
  // Before the new screen paints, so its entrance keyframes never start.
  useLayoutEffect(() => {
    if (seen.current !== null && seen.current !== pathname) document.documentElement.setAttribute("data-navigated", "");
    seen.current = pathname;
  }, [pathname]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const main = document.querySelector("main");
    const target = (main?.querySelector("h1") ?? main) as HTMLElement | null;
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
