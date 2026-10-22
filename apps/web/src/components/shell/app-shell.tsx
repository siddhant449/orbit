"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { SWRConfig, type SWRConfiguration } from "swr";
import { CloseIcon } from "@brandloop/ui/icons";
import { Grain, cn, useMediaQuery } from "@brandloop/ui";
import { SmoothScroll } from "@brandloop/ui/scroll";
import type { ShellAccount } from "@/lib/account";
import { sectionFor } from "@/lib/nav";
import { AccountProvider } from "./account-context";
import { CommandPalette } from "./command-palette";
import { MobileHeader } from "./mobile-header";
import { MobileTabbar } from "./mobile-tabbar";
import { RouteFocus } from "./route-focus";
import { MainSidebar, Rail, SPRINT, SectionPanel } from "./sidebar";

const COLLAPSED_KEY = "brandloop:sidebar-collapsed";

/**
 * Coming back to the tab revalidates what's on screen at most once a minute, and never blanks it: data stays put while
 * it refreshes (no loading state on return), and a hidden tab doesn't poll.
 */
export const SWR_OPTIONS: SWRConfiguration = { focusThrottleInterval: 60_000, keepPreviousData: true, refreshWhenHidden: false };

const COLLAPSED_EVENT = "brandloop:sidebar";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Focuses the home composer once it exists and the shell has finished moving focus to the new page. */
function focusComposerSoon() {
  const started = Date.now();
  const tick = () => {
    const el = document.getElementById("composer");
    if (el && window.location.pathname === "/") {
      el.focus();
      return;
    }
    if (Date.now() - started < 2000) window.setTimeout(tick, 50);
  };
  window.setTimeout(tick, 80);
}

/**
 * The Orbit app shell (screens.md A): the 240 px sidebar (or the 72 px rail when collapsed, on tablets and beside a
 * section sub-nav) and the main column on `ground` with the ambient glow and static grain behind it. Below 768 px the
 * sidebar gives way to the mobile header, the bottom tab bar and the navigation drawer. Routes switch instantly.
 */
export function AppShell({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const section = sectionFor(pathname);
  // Post editor: document mode. The sidebar steps aside (the chat column carries the way back) to give the editor room.
  const focusMode = /^\/posts\/[^/]+\/?$/.test(pathname);
  const collapsedPref = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const tablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
  const collapsed = collapsedPref || tablet;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  const toggleCollapsed = useCallback(() => writeCollapsed(!readCollapsed()), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (key === "b") {
        e.preventDefault();
        toggleCollapsed();
      } else if (key === "j") {
        // New draft: focus the composer on home, otherwise go home first.
        e.preventDefault();
        const composer = document.getElementById("composer");
        if (window.location.pathname === "/" && composer) composer.focus();
        else {
          router.push("/");
          focusComposerSoon();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed, router]);

  const openSearch = () => setPaletteOpen(true);
  const asideWidth = section ? 72 + 220 : collapsed ? 72 : 240;

  return (
    <AccountProvider account={account}>
      <SWRConfig value={SWR_OPTIONS}>
      <div className="relative flex h-svh overflow-hidden bg-ground text-text">
        <span aria-hidden="true" className="orbit-ambient" />
        <Grain />
        <aside
          aria-label="Sidebar"
          style={{ width: asideWidth }}
          className={cn(
            "relative hidden shrink-0 overflow-hidden border-r border-line-soft",
            focusMode ? "md:hidden" : "md:flex",
            "motion-safe:transition-[width] motion-safe:duration-[400ms] motion-safe:ease-[var(--ease-out)]",
          )}
        >
          {section ? (
            <>
              <div className="border-r border-line-soft">
                <Rail onSearch={openSearch} />
              </div>
              <SectionPanel section={section} />
            </>
          ) : collapsed ? (
            <Rail onSearch={openSearch} onExpand={tablet ? undefined : toggleCollapsed} />
          ) : (
            <MainSidebar onSearch={openSearch} onCollapse={toggleCollapsed} />
          )}
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <MobileHeader sprint={SPRINT} onSearch={openSearch} onMenu={() => setDrawerOpen(true)} />
          <div data-sheet="" className="relative flex min-h-0 flex-1 flex-col">
            <SmoothScroll className="min-h-0 flex-1 overflow-y-auto">{children}</SmoothScroll>
          </div>
          <MobileTabbar pathname={pathname} />
          <RouteFocus />
        </main>
      </div>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(10,10,11,0.5)] data-[state=closed]:animate-[fade-out_180ms_var(--ease-out)_both] data-[state=open]:animate-[fade-in_240ms_var(--ease-out)_both] md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            data-lenis-prevent
            className="fixed inset-y-0 left-0 z-40 flex w-[min(300px,86vw)] flex-col border-r border-line-soft bg-ground data-[state=closed]:animate-[drawer-out_180ms_var(--ease-out)_both] data-[state=open]:animate-[drawer-in_400ms_var(--ease-out)_both] md:hidden"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close
              aria-label="Close navigation"
              className="orbit-transition absolute right-3 top-[18px] z-10 grid size-8 place-items-center rounded-full border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse"
            >
              <CloseIcon size={15} />
            </Dialog.Close>
            {section ? (
              <div className="flex h-full flex-col overflow-y-auto">
                <SectionPanel section={section} onNavigate={closeDrawer} className="h-auto pr-14" />
                <div className="border-t border-line-soft">
                  <MainSidebar onSearch={openSearch} onNavigate={closeDrawer} indicatorId="nav-drawer" />
                </div>
              </div>
            ) : (
              <MainSidebar onSearch={openSearch} onNavigate={closeDrawer} indicatorId="nav-drawer" />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </SWRConfig>
    </AccountProvider>
  );
}
