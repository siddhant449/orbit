"use client";

import Link from "next/link";
import { cn } from "@brandloop/ui";
import { isActive, mobileTabs } from "@/lib/nav";

/**
 * Mobile tab bar (<768, system §9, p16): five 48x44 icon links named by `aria-label`; the current one fills
 * `accent-text` with a soft glow. Additive to the drawer, which keeps the full nav.
 */
export function MobileTabbar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="relative flex shrink-0 items-center justify-around border-t border-line-soft bg-ground px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2.5 md:hidden"
    >
      {mobileTabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" || pathname.startsWith("/chat/") : isActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "orbit-transition grid h-11 w-12 place-items-center rounded-[14px]",
              active ? "bg-accent-text text-ground shadow-[0_0_24px_rgba(124,138,255,0.35)]" : "text-text-2 hover:text-text",
            )}
          >
            <Icon size={20} aria-hidden="true" />
          </Link>
        );
      })}
    </nav>
  );
}
