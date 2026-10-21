"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { DropdownMenu } from "radix-ui";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun, UserPlus } from "lucide-react";
import { cn } from "@brandloop/ui";
import { switchProfileAction } from "@/app/(app)/actions";
import { AddProfileDialog } from "./add-profile-dialog";
import { Avatar } from "./avatar";
import { useAccount, useCurrentProfile } from "./account-context";

const itemClass =
  "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-row px-2.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-sunk";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ProfileMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const account = useAccount();
  const current = useCurrentProfile();
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  const name = current?.name ?? account.user.name ?? account.user.email;

  function switchTo(id: string, profileName: string) {
    if (id === account.currentProfileId) return;
    startTransition(async () => {
      const result = await switchProfileAction(id);
      if (result.ok) toast.success(`Switched to ${profileName}`);
      else toast.error(result.error);
    });
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={cn(
            "flex items-center gap-2.5 rounded-row text-left text-sm outline-none hover:bg-surface-sunk focus-visible:ring-2 focus-visible:ring-accent/30",
            iconOnly ? "size-9 justify-center" : "h-11 w-full px-2",
          )}
          aria-label="Profile menu"
        >
          <Avatar name={name} src={current?.avatarUrl} />
          {!iconOnly && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{name}</span>
              <ChevronsUpDown className="size-4 shrink-0 text-ink-faint" />
            </>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            className="z-50 w-64 rounded-[14px] border border-line bg-surface p-1.5 shadow-lg"
          >
            <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs text-ink-muted">
              {account.team.name}
            </DropdownMenu.Label>
            {account.profiles.map((p) => (
              <DropdownMenu.Item key={p.id} className={itemClass} onSelect={() => switchTo(p.id, p.name)}>
                <Avatar name={p.name} src={p.avatarUrl} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === account.currentProfileId && <Check className="size-4 text-accent" aria-label="Current profile" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item className={itemClass} onSelect={() => setAdding(true)}>
              <UserPlus className="size-4 text-ink-muted" />
              Add profile
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
            <DropdownMenu.Item className={itemClass} asChild>
              <Link href="/settings">
                <Settings className="size-4 text-ink-muted" />
                Settings
              </Link>
            </DropdownMenu.Item>
            <div role="radiogroup" aria-label="Theme" className="mx-1 my-1 grid grid-cols-3 gap-1 rounded-row bg-surface-sunk p-1">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "grid h-7 place-items-center rounded-[7px] text-ink-muted",
                    theme === value && "bg-surface text-ink shadow-sm",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
            <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
            <DropdownMenu.Item
              className={cn(itemClass, "text-danger")}
              onSelect={() => signOut({ redirectUrl: "/sign-in" })}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <AddProfileDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
