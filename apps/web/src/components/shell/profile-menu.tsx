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

// Highlighted rows invert to an ink bar with paper text (H1).
const itemClass =
  "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-row px-2.5 type-ui text-ink outline-none data-[highlighted]:bg-ink data-[highlighted]:text-on-ink [&_svg]:text-ink-muted data-[highlighted]:[&_svg]:text-on-ink";

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
            "flex items-center gap-2.5 rounded-row text-left type-ui outline-none hover:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            iconOnly ? "size-9 justify-center" : "h-11 w-full px-2",
          )}
          aria-label={iconOnly ? "Profile menu" : `Profile menu, ${name}`}
        >
          <Avatar name={name} src={current?.avatarUrl} />
          {!iconOnly && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{name}</span>
              <ChevronsUpDown className="icon-sm shrink-0 text-ink-faint" aria-hidden="true" />
            </>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            data-lenis-prevent
            className="plate plate--sm z-50 w-64 p-1.5 data-[state=open]:animate-[plate-in_120ms_var(--ease-ink)_both]"
          >
            <DropdownMenu.Label className="type-caption px-2.5 pb-1 pt-1.5 text-ink-muted">{account.team.name}</DropdownMenu.Label>
            {account.profiles.map((p) => (
              <DropdownMenu.Item key={p.id} className={itemClass} onSelect={() => switchTo(p.id, p.name)}>
                <Avatar name={p.name} src={p.avatarUrl} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === account.currentProfileId && (
                  <Check className="icon-sm !text-overprint data-[highlighted]:!text-on-ink" aria-label="Current profile" />
                )}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item className={itemClass} onSelect={() => setAdding(true)}>
              <UserPlus className="icon-sm" aria-hidden="true" />
              Add profile
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
            <DropdownMenu.Item className={itemClass} asChild>
              <Link href="/settings">
                <Settings className="icon-sm" aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenu.Item>
            <div role="radiogroup" aria-label="Theme" className="mx-1 my-1.5 grid grid-cols-3 gap-1">
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
                    "grid h-8 place-items-center rounded-control border border-transparent text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink",
                    theme === value && "border-keyline bg-pink text-on-pink hover:bg-pink hover:text-on-pink",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
            <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
            <DropdownMenu.Item
              className={cn(itemClass, "text-danger [&_svg]:text-danger data-[highlighted]:bg-danger data-[highlighted]:text-on-danger data-[highlighted]:[&_svg]:text-on-danger")}
              onSelect={() => signOut({ redirectUrl: "/sign-in" })}
            >
              <LogOut className="icon-sm" aria-hidden="true" />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <AddProfileDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
