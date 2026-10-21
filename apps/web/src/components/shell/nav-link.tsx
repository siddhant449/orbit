"use client";

import Link from "next/link";
import { cn } from "@brandloop/ui";
import type { NavItem } from "@/lib/nav";

/**
 * A row of the printed index (C7): an ink bar sweeps in from the left and the label rolls up while its hidden
 * duplicate rolls in. The duplicate is `aria-hidden`, so the link's accessible name stays the label alone.
 */
export function NavLink({
  item,
  active,
  iconOnly = false,
  onNavigate,
  onHover,
}: {
  item: NavItem;
  active: boolean;
  iconOnly?: boolean;
  onNavigate?: () => void;
  onHover?: (label: string | null) => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={iconOnly ? item.label : undefined}
      className={cn("nav-row", iconOnly && "nav-row--icon")}
      onMouseEnter={() => onHover?.(item.label)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(item.label)}
      onBlur={() => onHover?.(null)}
    >
      <span aria-hidden="true" className="nav-row__bar" />
      <Icon aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
      {iconOnly ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="nav-row__label">
          <span className="nav-row__text">{item.label}</span>
          <span aria-hidden="true" className="nav-row__text nav-row__text--dup">
            {item.label}
          </span>
        </span>
      )}
    </Link>
  );
}
