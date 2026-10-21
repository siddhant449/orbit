"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Menu, X } from "lucide-react";
import { Button } from "@brandloop/ui";
import type { ShellAccount } from "@/lib/account";
import { sectionFor } from "@/lib/nav";
import { AccountProvider } from "./account-context";
import { CommandPalette } from "./command-palette";
import { Logo } from "./logo";
import { MainSidebar, Rail, SectionPanel } from "./sidebar";

const COLLAPSED_KEY = "brandloop:sidebar-collapsed";

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

export function AppShell({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  const toggleCollapsed = useCallback(() => writeCollapsed(!readCollapsed()), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const openSearch = () => setPaletteOpen(true);

  return (
    <AccountProvider account={account}>
      <div className="flex h-svh">
        <aside aria-label="Sidebar" className="hidden shrink-0 md:flex">
          {section ? (
            <>
              <Rail onSearch={openSearch} />
              <div className="w-[228px]">
                <SectionPanel section={section} />
              </div>
            </>
          ) : collapsed ? (
            <Rail onSearch={openSearch} onExpand={toggleCollapsed} />
          ) : (
            <div className="w-[248px]">
              <MainSidebar onSearch={openSearch} onCollapse={toggleCollapsed} />
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface md:rounded-card md:border md:border-line">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 md:hidden">
              <Logo />
              <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
                <Menu />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </div>
        </main>
      </div>

      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-40 flex w-[min(300px,86vw)] flex-col bg-paper shadow-xl md:hidden"
          >
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="absolute right-3 top-4 z-10" aria-label="Close navigation">
                <X />
              </Button>
            </Dialog.Close>
            {section ? (
              <div className="flex h-full flex-col overflow-y-auto">
                <SectionPanel section={section} onNavigate={closeDrawer} />
                <div className="border-t border-line">
                  <MainSidebar onSearch={openSearch} onNavigate={closeDrawer} />
                </div>
              </div>
            ) : (
              <MainSidebar onSearch={openSearch} onNavigate={closeDrawer} />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </AccountProvider>
  );
}
