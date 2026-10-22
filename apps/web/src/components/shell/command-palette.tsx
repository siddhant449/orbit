"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { PencilIcon, SearchIcon } from "@brandloop/ui/icons";
import { paletteValue, primaryNav, sections } from "@/lib/nav";
import { switchProfileAction } from "@/app/(app)/actions";
import { useAccount } from "./account-context";

const groupClass =
  "px-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-text-3";
// The selected row takes the nav's `line-row` fill; its icon turns accent like the current nav row (system §6.9).
const itemClass =
  "flex h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-[14px] text-text-soft transition-colors duration-150 data-[selected=true]:bg-line-row data-[selected=true]:text-text [&_svg]:size-[17px] [&_svg]:shrink-0 [&_svg]:text-icon data-[selected=true]:[&_svg]:text-accent-text";

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgba(10,10,11,0.5)] backdrop-blur-[2px] data-[state=closed]:animate-[fade-out_120ms_var(--ease-out)_both] data-[state=open]:animate-[fade-in_180ms_var(--ease-out)_both]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[18vh] z-50 w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[18px] border border-line-3 bg-panel shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=closed]:animate-[fade-out_120ms_var(--ease-out)_both] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command loop>
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <SearchIcon size={17} className="text-text-2" />
              <Command.Input
                autoFocus
                placeholder="Search pages and profiles…"
                className="h-14 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-text-3"
              />
              <kbd className="rounded-pill border border-line-3 px-2 py-0.5 font-sans text-[11px] text-text-3">Esc</kbd>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto pb-2" data-lenis-prevent>
              <Command.Empty className="px-4 py-8 text-center text-[13px] text-text-2">Nothing matches that search.</Command.Empty>
              <Command.Group heading="Actions" className={groupClass}>
                <Command.Item className={itemClass} onSelect={() => go("/")}>
                  <PencilIcon />
                  New draft
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={groupClass}>
                {pages.map((item, i) => (
                  <Command.Item
                    key={`${item.href}-${i}`}
                    value={paletteValue(item)}
                    className={itemClass}
                    onSelect={() => go(item.href)}
                  >
                    <item.icon aria-hidden="true" />
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
                      <UserRound aria-hidden="true" />
                      {p.name}
                      {p.id === account.currentProfileId && <span className="ml-auto text-[12px] text-text-3">Current</span>}
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
