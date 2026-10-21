"use client";

import Link from "next/link";
import { cn } from "@brandloop/ui";
import type { NavItem } from "@/lib/nav";

export function NavLink({
  item,
  active,
  iconOnly = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  iconOnly?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={iconOnly ? item.label : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-row text-sm transition-colors",
        iconOnly ? "w-8 justify-center" : "px-2.5",
        active
          ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]"
          : "text-ink-muted hover:bg-surface-sunk hover:text-ink",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      {iconOnly ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  );
}
