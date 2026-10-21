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
  "px-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-muted";
const itemClass =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-row px-2 text-sm text-ink data-[selected=true]:bg-surface-sunk";

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[18vh] z-50 w-[calc(100%-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-card border border-line bg-surface shadow-2xl"
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-ink-faint" />
              <Command.Input
                autoFocus
                placeholder="Search pages and profiles…"
                className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-8 text-center text-sm text-ink-muted">
                Nothing matches that search.
              </Command.Empty>
              <Command.Group heading="Actions" className={groupClass}>
                <Command.Item className={itemClass} onSelect={() => go("/")}>
                  <MessageSquarePlus className="size-4 text-ink-muted" />
                  New chat
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={groupClass}>
                {pages.map((item) => (
                  <Command.Item key={item.href} value={`${item.label} ${item.href}`} className={itemClass} onSelect={() => go(item.href)}>
                    <item.icon className="size-4 text-ink-muted" />
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
                      <UserRound className="size-4 text-ink-muted" />
                      {p.name}
                      {p.id === account.currentProfileId && <span className="ml-auto text-xs text-ink-muted">Current</span>}
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
