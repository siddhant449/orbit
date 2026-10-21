"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { MessageSquarePlus, Search, UserRound } from "lucide-react";
import { primaryNav, sections } from "@/lib/nav";
import { switchProfileAction } from "@/app/(app)/actions";
import { useAccount } from "./account-context";

const groupClass =
  "px-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:type-caption [&_[cmdk-group-heading]]:text-ink-muted";
// Selected rows invert to an ink bar with paper text (H1); icons follow the text colour.
const itemClass =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-row px-2 type-ui text-ink data-[selected=true]:bg-ink data-[selected=true]:text-on-ink [&_svg]:text-ink-muted data-[selected=true]:[&_svg]:text-on-ink";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const account = useAccount();
  const [, startTransition] = useTransition();
  const pages = [...primaryNav.slice(1), ...sections.flatMap((s) => s.groups.flatMap((g) => g.items))];

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=closed]:animate-[fade-out_120ms_var(--ease-exit)_both] data-[state=open]:animate-[fade-in_180ms_var(--ease-ink)_both]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="plate plate--overlay fixed left-1/2 top-[18vh] z-50 w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden data-[state=closed]:animate-[fade-out_120ms_var(--ease-exit)_both] data-[state=open]:animate-[plate-in_180ms_var(--ease-ink)_both]"
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="icon-sm text-ink-faint" aria-hidden="true" />
              <Command.Input
                autoFocus
                placeholder="Search pages and profiles…"
                className="h-12 flex-1 bg-transparent type-ui text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="type-micro rounded-control border border-line-strong px-1.5 py-0.5 text-ink-muted">Esc</kbd>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto pb-2" data-lenis-prevent>
              <Command.Empty className="px-4 py-8 text-center type-ui text-ink-muted">Nothing matches that search.</Command.Empty>
              <Command.Group heading="Actions" className={groupClass}>
                <Command.Item className={itemClass} onSelect={() => go("/")}>
                  <MessageSquarePlus className="icon-sm" aria-hidden="true" />
                  New chat
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={groupClass}>
                {pages.map((item, i) => (
                  <Command.Item
                    key={`${item.href}-${i}`}
                    value={`${item.label} ${item.href}`}
                    className={itemClass}
                    onSelect={() => go(item.href)}
                  >
                    <item.icon className="icon-sm" aria-hidden="true" />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
              {account.profiles.length > 1 && (
                <Command.Group heading="Switch profile" className={groupClass}>
                  {account.profiles.map((p) => (
                    <Command.Item
                      key={p.id}
                      value={`profile ${p.name}`}
                      className={itemClass}
                      onSelect={() => {
                        onOpenChange(false);
                        startTransition(async () => {
                          const r = await switchProfileAction(p.id);
                          if (r.ok) toast.success(`Switched to ${p.name}`);
                          else toast.error(r.error);
                        });
                      }}
                    >
                      <UserRound className="icon-sm" aria-hidden="true" />
                      {p.name}
                      {p.id === account.currentProfileId && <span className="ml-auto type-caption opacity-70">Current</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
