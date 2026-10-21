"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
import { isActive, primaryNav, type Section } from "@/lib/nav";
import { Logo, LogoMark } from "./logo";
import { NavLink } from "./nav-link";
import { ProfileMenu } from "./profile-menu";

type Handlers = { onSearch: () => void; onNavigate?: () => void };

function SearchButton({ onSearch, wide = false }: { onSearch: () => void; wide?: boolean }) {
  return (
    <Button variant="ghost" size="icon" onClick={onSearch} aria-label="Search (Ctrl K)" title="Search  ⌘K" className={cn(wide && "size-8")}>
      <Search />
    </Button>
  );
}

/** Full sidebar: brand, primary nav, chat history, profile. */
export function MainSidebar({ onSearch, onNavigate, onCollapse }: Handlers & { onCollapse?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-full flex-col px-3 pb-3 pt-4">
      <div className="flex items-center justify-between pl-1.5">
        <Link href="/" onClick={onNavigate} aria-label="Brandloop home">
          <Logo />
        </Link>
        <div className="flex items-center">
          <SearchButton onSearch={onSearch} />
          {onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse  ⌘B">
              <PanelLeftClose />
            </Button>
          )}
        </div>
      </div>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
        ))}
      </nav>

      <section aria-labelledby="chats-heading" className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <h2 id="chats-heading" className="px-2.5 text-xs font-medium text-ink-muted">
          Chats
        </h2>
        <p className="mt-2 px-2.5 text-sm leading-relaxed text-ink-faint">
          Your conversations will be listed here once you start one.
        </p>
      </section>

      <div className="border-t border-line pt-2">
        <ProfileMenu />
      </div>
    </div>
  );
}

/** Narrow icon rail, used when the sidebar is collapsed or a section panel is open. */
export function Rail({ onSearch, onExpand }: Handlers & { onExpand?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-14 flex-col items-center gap-1 pb-3 pt-4">
      <Link href="/" aria-label="Brandloop home" className="mb-3 grid size-8 place-items-center">
        <LogoMark />
      </Link>
      <SearchButton onSearch={onSearch} />
      {primaryNav.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} iconOnly />
      ))}
      <div className="flex-1" />
      {onExpand && (
        <Button variant="ghost" size="icon" onClick={onExpand} aria-label="Expand sidebar" title="Expand  ⌘B">
          <PanelLeftOpen />
        </Button>
      )}
      <ProfileMenu iconOnly />
    </div>
  );
}

/** Second-level navigation for a section such as Ideas or Settings. */
export function SectionPanel({ section, onNavigate }: { section: Section; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-full flex-col px-3 pb-3 pt-4">
      <h2 className="flex h-8 items-center px-2.5 font-display text-[17px] font-semibold tracking-[-0.01em]">
        {section.title}
      </h2>
      <nav aria-label={section.title} className="mt-4 flex flex-col gap-5 overflow-y-auto">
        {section.groups.map((group) => (
          <div key={group.label ?? "default"} className="flex flex-col gap-0.5">
            {group.label && <h3 className="mb-1 px-2.5 text-xs font-medium text-ink-muted">{group.label}</h3>}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
