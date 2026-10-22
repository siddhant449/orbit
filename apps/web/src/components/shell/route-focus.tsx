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
    if (!main) return;
    const focus = (target: HTMLElement) => {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    const h1 = main.querySelector("h1");
    if (h1 || !main.querySelector("[data-route-loading]")) {
      focus((h1 ?? main) as HTMLElement);
      return;
    }
    // A loading skeleton is up: hold focus on the main landmark, then hand it to the heading once the screen arrives,
    // unless the reader has moved focus on in the meantime.
    focus(main);
    const mo = new MutationObserver(() => {
      const heading = main.querySelector("h1");
      if (!heading) return;
      mo.disconnect();
      if (document.activeElement === main || document.activeElement === document.body) focus(heading);
    });
    mo.observe(main, { childList: true, subtree: true });
    const stop = window.setTimeout(() => mo.disconnect(), 10_000);
    return () => {
      mo.disconnect();
      window.clearTimeout(stop);
    };
  }, [pathname]);
  return null;
}
