"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
import { isActive, primaryNav, type Section } from "@/lib/nav";
import { IndexLabel } from "./index-label";
import { Logo, LogoMark } from "./logo";
import { NavLink } from "./nav-link";
import { ProfileMenu } from "./profile-menu";

type Handlers = { onSearch: () => void; onNavigate?: () => void };

function SearchButton({ onSearch }: { onSearch: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onSearch} aria-label="Search (Ctrl K)" title="Search  ⌘K">
      <Search />
    </Button>
  );
}

/** The printed index: brand, primary nav with kinetic rows, chats, the clipped index label, profile. */
export function MainSidebar({ onSearch, onNavigate, onCollapse }: Handlers & { onCollapse?: () => void }) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const current = primaryNav.find((item) => isActive(pathname, item.href));
  const indexLabel = hovered ?? (pathname === "/" ? "Brandloop" : (current?.label ?? "Brandloop"));
  return (
    <div className="relative flex h-full w-[248px] flex-col px-3 pb-3 pt-4">
      <div className="flex items-center justify-between pl-1.5">
        <Link href="/" onClick={onNavigate} aria-label="Brandloop home" className="rounded-control">
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
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            onNavigate={onNavigate}
            onHover={setHovered}
          />
        ))}
      </nav>

      <section aria-labelledby="chats-heading" className="relative z-[1] mt-7 min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
        <h2 id="chats-heading" className="type-caption px-2.5 text-ink-muted">
          Chats
        </h2>
        <p className="type-ui mt-2 max-w-[26ch] px-2.5 text-ink-faint">
          Your conversations will be listed here once you start one.
        </p>
      </section>

      <IndexLabel label={indexLabel} />

      <div className="relative z-[1] border-t border-line pt-2">
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
      <Link href="/" aria-label="Brandloop home" className="mb-3 grid size-9 place-items-center rounded-control">
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
  const [hovered, setHovered] = useState<string | null>(null);
  const items = section.groups.flatMap((g) => g.items);
  const current = items.find((item) => isActive(pathname, item.href));
  return (
    <div className="relative flex h-full w-[228px] flex-col px-3 pb-3 pt-4">
      <h2 className="type-title-2 flex h-9 items-center px-2.5">{section.title}</h2>
      <nav aria-label={section.title} className="relative z-[1] mt-4 flex flex-col gap-5 overflow-y-auto" data-lenis-prevent>
        {section.groups.map((group) => (
          <div key={group.label ?? "default"} className="flex flex-col gap-0.5">
            {group.label && <h3 className={cn("type-caption mb-1 px-2.5 text-ink-muted")}>{group.label}</h3>}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                onNavigate={onNavigate}
                onHover={setHovered}
              />
            ))}
          </div>
        ))}
      </nav>
      <IndexLabel label={hovered ?? current?.label ?? section.title} />
    </div>
  );
}
