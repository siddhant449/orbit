"use client";

import Link from "next/link";
import { MenuIcon, SearchIcon } from "@brandloop/ui/icons";
import { Logo } from "./logo";
import { SprintPill, type SprintState } from "./sprint-card";

const circle =
  "orbit-transition grid size-11 place-items-center rounded-full border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse";

/**
 * Mobile header (<768, system §9, p16): logo, the sprint pill with its 16 px ring, search, and the drawer that keeps
 * the full nav, chat history and settings reachable.
 */
export function MobileHeader({
  sprint,
  onSearch,
  onMenu,
}: {
  sprint: SprintState;
  onSearch: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="relative flex shrink-0 items-center justify-between gap-3 px-(--gutter) pb-2 pt-[calc(env(safe-area-inset-top)+8px)] md:hidden">
      <Link href="/" aria-label="Orbit home" className="rounded-pill">
        <Logo />
      </Link>
      <div className="flex items-center gap-2">
        <SprintPill state={sprint} />
        <button type="button" onClick={onSearch} aria-label="Search" className={circle}>
          <SearchIcon size={18} />
        </button>
        <button type="button" onClick={onMenu} aria-label="Open navigation" className={circle}>
          <MenuIcon size={18} />
        </button>
      </div>
    </header>
  );
}
