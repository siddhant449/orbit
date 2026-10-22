"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchIcon, SidebarIcon } from "@brandloop/ui/icons";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { cn } from "@brandloop/ui";
import { isActive, primaryNav, type Section } from "@/lib/nav";
import { ChatHistory } from "@/components/chat/chat-history";
import { Logo, LogoMark } from "./logo";
import { MainNav, RailLink, SectionLink } from "./nav-link";
import { ProfileMenu } from "./profile-menu";
import { SprintCard, type SprintState } from "./sprint-card";

type Handlers = { onSearch: () => void; onNavigate?: () => void };

/** O2 has no challenge data, so the sprint is always "not started" (O11 brings the real state). */
export const SPRINT: SprintState = { kind: "not-started" };

const iconButton =
  "orbit-transition grid size-8 shrink-0 place-items-center rounded-full border border-line-control text-text-2 hover:border-inverse hover:bg-inverse hover:text-on-inverse";

/**
 * The full sidebar (system §6.9, p01): logo and the ⌘K pill, the sprint card, the six nav rows, the chat history and
 * the profile footer. 240 px with a `line-soft` right edge (drawn by the aside).
 */
export function MainSidebar({
  onSearch,
  onNavigate,
  onCollapse,
  indicatorId = "nav-main",
}: Handlers & { onCollapse?: () => void; indicatorId?: string }) {
  const pathname = usePathname();
  return (
    <div className="relative flex h-full w-[240px] shrink-0 flex-col px-3 py-[18px]">
      <div className="flex items-center justify-between gap-2 px-2 pb-4 pt-1">
        <Link href="/" onClick={onNavigate} aria-label="Orbit home" className="rounded-pill">
          <Logo />
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSearch}
            aria-keyshortcuts="Meta+K Control+K"
            className="orbit-transition h-8 rounded-pill border border-line-control px-2.5 text-[12px] text-text-2 hover:border-inverse hover:bg-inverse hover:text-on-inverse"
          >
            {/* Named "Search ⌘K" so the visible hint is part of the name (WCAG 2.5.3). */}
            <span className="sr-only">Search </span>⌘K
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              aria-keyshortcuts="Meta+B Control+B"
              title="Collapse  ⌘B"
              className={iconButton}
            >
              <SidebarIcon size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="mb-3.5">
        <SprintCard state={SPRINT} active={pathname === "/challenge"} onNavigate={onNavigate} />
      </div>

      <MainNav pathname={pathname} onNavigate={onNavigate} indicatorId={indicatorId} />

      <section aria-labelledby={`${indicatorId}-chats`} className="mt-[22px] min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
        <h2 id={`${indicatorId}-chats`} className="sr-only">
          Chats
        </h2>
        <ChatHistory onNavigate={onNavigate} />
      </section>

      <div className="mt-auto pt-3">
        <ProfileMenu />
      </div>
    </div>
  );
}

/**
 * The 72 px rail (system §6.9 rail, p13/p14): the collapsed sidebar, the tablet sidebar, and the left column of the
 * sectioned screens. 40 px icon links; the current one fills `accent-text`.
 */
export function Rail({ onSearch, onExpand }: Handlers & { onExpand?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 py-[18px]">
      <Link href="/" aria-label="Orbit home" className="mb-2 grid size-10 place-items-center rounded-[12px]">
        <LogoMark size={20} />
      </Link>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        className="orbit-transition grid size-10 place-items-center rounded-[12px] text-text-2 hover:bg-line-soft hover:text-text"
      >
        <SearchIcon size={18} />
      </button>
      <nav aria-label="Main" className="flex flex-col items-center gap-2">
        {primaryNav.map((item) => (
          <RailLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
      <div className="flex-1" />
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand sidebar"
          aria-keyshortcuts="Meta+B Control+B"
          title="Expand  ⌘B"
          className="orbit-transition grid size-10 place-items-center rounded-[12px] text-text-2 hover:bg-line-soft hover:text-text"
        >
          <SidebarIcon size={18} />
        </button>
      )}
      <ProfileMenu iconOnly settingsActive={pathname.startsWith("/settings")} />
    </div>
  );
}

/** Section sub-nav (system §6.9, p13/p14): 220 px, `card-title` heading, grouped rows with an accent dot on the current. */
export function SectionPanel({ section, onNavigate, className }: { section: Section; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  return (
    <div className={cn("flex h-full w-[220px] shrink-0 flex-col px-3 py-[22px]", className)}>
      <h2 className="type-card-title px-2.5 text-text">{section.title}</h2>
      <nav aria-label={section.title} className="mt-5 flex flex-col gap-5 overflow-y-auto" data-lenis-prevent>
        {section.groups.map((group) => (
          <div key={group.label ?? "default"} className="flex flex-col gap-1">
            {group.label && <h3 className="mb-0.5 px-2.5 text-[11px] text-text-3">{group.label}</h3>}
            {group.items.map((item) => (
              <SectionLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      {/* Theme switch at the foot of the Settings sub-nav (system §3, p14). */}
      {section.id === "settings" && <ThemeSwitch className="mt-auto px-2.5 pt-6" />}
    </div>
  );
}
