"use client";

import { cn } from "@brandloop/ui";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { THEME_CHOICES, themeChoice } from "./theme-choice";

const subscribe = () => () => {};

/**
 * Light / Dark / Auto (system §3, [p14]): three 32 px pills, the selected one `inverse`. next-themes only knows the
 * stored theme on the client, so the server render presses nothing and hydration fills it in.
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = mounted ? themeChoice(theme) : null;

  return (
    <div role="group" aria-label="Theme" className={cn("flex gap-1.5", className)}>
      {THEME_CHOICES.map((c) => {
        const pressed = current === c.value;
        return (
          <button
            key={c.value}
            type="button"
            aria-label={c.name}
            aria-pressed={pressed}
            onClick={() => setTheme(c.value)}
            className={cn(
              "orbit-transition inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-pill border px-3 text-xs",
              pressed
                ? "border-inverse bg-inverse font-medium text-on-inverse"
                : "border-line-2 text-text-2 hover:border-line-hover hover:text-text",
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
