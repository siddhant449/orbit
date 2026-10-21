"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@brandloop/ui";

const options = [
  { value: "light", label: "Day", Icon: Sun },
  { value: "dark", label: "Night", Icon: Moon },
] as const;

const noop = () => () => {};

/**
 * Day / night print switch. next-themes knows the stored theme on the first client render but not on the server,
 * so both buttons stay unpressed until after hydration.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <div role="group" aria-label="Print theme" className="flex gap-2">
      {options.map(({ value, label, Icon }) => {
        const pressed = mounted && resolvedTheme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            onClick={() => setTheme(value)}
            className={cn(
              "type-ui inline-flex min-h-11 items-center gap-2 rounded-pill border border-keyline px-4 font-medium",
              pressed ? "bg-pink text-on-pink" : "bg-surface text-ink hover:bg-surface-sunk",
            )}
          >
            <Icon aria-hidden className="icon-sm" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
