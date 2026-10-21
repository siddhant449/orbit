"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { DropdownMenu } from "radix-ui";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Monitor, Moon, Sun, UserPlus } from "lucide-react";
import { CheckIcon, ChevronUpIcon, SettingsIcon, SignOutIcon } from "@brandloop/ui/icons";
import { cn } from "@brandloop/ui";
import { switchProfileAction } from "@/app/(app)/actions";
import { AddProfileDialog } from "./add-profile-dialog";
import { Avatar } from "./avatar";
import { useAccount, useCurrentProfile } from "./account-context";

// Menu rows answer like nav rows: `line-row` fill and full-strength text (system §6.9).
export const menuItemClass =
  "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] text-text-soft outline-none transition-colors duration-150 data-[highlighted]:bg-line-row data-[highlighted]:text-text [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-icon data-[highlighted]:[&_svg]:text-text";
const itemClass = menuItemClass;
/** Overlay panel for menus: `panel`, radius 14, `line-3` edge, the draft shadow. */
export const menuContentClass =
  "z-50 rounded-[14px] border border-line-3 bg-panel p-1.5 shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=open]:animate-[orbit-pop_160ms_var(--ease-out)_both]";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * Profile footer and menu (system §6.9): 32 px gradient avatar, the profile name and its workspace, a chevron; opens
 * profile switching, add profile, settings, theme and sign out.
 */
export function ProfileMenu({ iconOnly = false, settingsActive = false }: { iconOnly?: boolean; settingsActive?: boolean }) {
  const account = useAccount();
  const current = useCurrentProfile();
  const { signOut } = useClerk();
  const { theme, setTheme } = useTheme();
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();
  const name = current?.name ?? account.user.name ?? account.user.email;
  const workspace = account.team.members > 1 ? account.team.name : "Personal workspace";

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
            "orbit-transition flex items-center gap-2.5 text-left",
            iconOnly
              ? "size-10 justify-center rounded-full"
              : "w-full rounded-[12px] px-2.5 pb-1 pt-3 hover:bg-line-soft data-[state=open]:bg-line-soft",
          )}
          aria-label={iconOnly ? "Profile menu" : undefined}
        >
          <Avatar
            name={name}
            src={current?.avatarUrl}
            className={cn(settingsActive && "shadow-[0_0_0_2px_var(--ground),0_0_0_4px_var(--accent-text)]")}
          />
          {!iconOnly && (
            <>
              {/* Named from its content ("Profile menu, <name>, <workspace>") so the visible text is the name. */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium text-text">
                  <span className="sr-only">Profile menu, </span>
                  {name}
                  <span className="sr-only">,</span>
                </span>
                <span className="truncate text-[11px] text-text-3">{workspace}</span>
              </span>
              <ChevronUpIcon size={14} className="shrink-0 text-text-3" />
            </>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={8}
            data-lenis-prevent
            className={cn(menuContentClass, "w-64")}
          >
            <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] text-text-3">{account.team.name}</DropdownMenu.Label>
            {account.profiles.map((p) => (
              <DropdownMenu.Item key={p.id} className={itemClass} onSelect={() => switchTo(p.id, p.name)}>
                <Avatar name={p.name} src={p.avatarUrl} className="size-6" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === account.currentProfileId && (
                  <CheckIcon className="!text-accent-text" aria-label="Current profile" />
                )}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item className={itemClass} onSelect={() => setAdding(true)}>
              <UserPlus aria-hidden="true" />
              Add profile
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line-3" />
            <DropdownMenu.Item className={itemClass} asChild>
              <Link href="/settings">
                <SettingsIcon />
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
                    "grid h-8 place-items-center rounded-pill text-text-2 transition-colors duration-150 hover:bg-line-row hover:text-text",
                    theme === value && "bg-inverse text-on-inverse hover:bg-inverse hover:text-on-inverse",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
            <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line-3" />
            <DropdownMenu.Item
              className={cn(itemClass, "text-danger [&_svg]:text-danger data-[highlighted]:text-danger data-[highlighted]:[&_svg]:text-danger")}
              onSelect={() => signOut({ redirectUrl: "/sign-in" })}
            >
              <SignOutIcon />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <AddProfileDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
