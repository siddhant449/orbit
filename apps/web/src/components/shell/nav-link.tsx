"use client";

import Link from "next/link";
import { m } from "motion/react";
import { cn, springLayout } from "@brandloop/ui";
import { isActive, primaryNav, type NavItem } from "@/lib/nav";

const SHORTCUT_KEYS: Record<string, string> = { "⌘J": "Meta+J Control+J" };

/**
 * A sidebar nav row (system §6.9): 38 px, radius 10, `text-soft`, 17 px icon in `icon`. The current row holds a
 * `line-soft` fill that slides between rows (`layoutId`, in-page motion) and turns its icon `accent-text`. Shortcut
 * hints and counts sit right-aligned in `text-3` tabular figures; the hint is decorative (the link carries
 * `aria-keyshortcuts`), a count is part of the name only when one exists.
 */
export function NavLink({
  item,
  active,
  indicatorId,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  /** Shared `layoutId` for the sliding fill; unique per nav instance (sidebar, drawer). */
  indicatorId: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-keyshortcuts={item.shortcut ? SHORTCUT_KEYS[item.shortcut] : undefined}
      className={cn(
        "orbit-transition group/nav relative flex min-h-[38px] items-center gap-3 rounded-[10px] px-2.5 text-[14px]",
        active ? "font-medium text-text" : "text-text-soft hover:bg-line-soft hover:text-text",
      )}
    >
      {active && (
        <m.span
          aria-hidden="true"
          layoutId={indicatorId}
          transition={springLayout}
          className="absolute inset-0 rounded-[10px] bg-line-soft"
        />
      )}
      <Icon
        size={17}
        aria-hidden="true"
        className={cn("relative shrink-0 transition-colors duration-150", active ? "text-accent-text" : "text-icon group-hover/nav:text-text")}
      />
      <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className="relative text-[12px] font-normal tabular-nums text-text-3">{item.count}</span>
      )}
      {item.shortcut && (
        <kbd aria-hidden="true" className="relative font-sans text-[12px] font-normal tabular-nums text-text-3">
          {item.shortcut}
        </kbd>
      )}
    </Link>
  );
}

/** The primary nav ("Main" keeps the e2e name; Orbit calls it "App", conflict C6). */
export function MainNav({
  pathname,
  onNavigate,
  indicatorId = "nav-main",
  className,
}: {
  pathname: string;
  onNavigate?: () => void;
  indicatorId?: string;
  className?: string;
}) {
  return (
    <nav aria-label="Main" className={cn("flex flex-col gap-0.5", className)}>
      {primaryNav.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
          indicatorId={indicatorId}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

/** A 40 px rail icon link (system §6.9 rail): radius 12, `text-2`; current fills `accent-text` with a ground icon. */
export function RailLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "orbit-transition grid size-10 shrink-0 place-items-center rounded-[12px]",
        active ? "bg-accent-text text-ground" : "text-text-2 hover:bg-line-soft hover:text-text",
      )}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="sr-only">{item.label}</span>
    </Link>
  );
}

/** Section sub-nav row (system §6.9): radius 10, `text-soft`; current takes `line-row`, weight 500 and a 6 px accent dot. */
export function SectionLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "orbit-transition flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-[14px]",
        active ? "bg-line-row font-medium text-text" : "text-text-soft hover:bg-line-soft hover:text-text",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent-text" />}
    </Link>
  );
}
