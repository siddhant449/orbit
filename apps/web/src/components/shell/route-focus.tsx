"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * After a client-side route change, focus moves to the new page's `h1` (or the main landmark), so keyboard and
 * screen-reader users land on the new content. Routes switch instantly; this only moves focus.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
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
