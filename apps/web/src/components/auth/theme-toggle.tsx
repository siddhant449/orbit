"use client";

import { cn } from "@brandloop/ui";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { nextTheme } from "./dither";

const subscribe = () => () => {};

/** One 36 px pill icon button: flips between Light and Dark (the full Light / Dark / Auto choice lives in Settings). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const target = nextTheme(mounted ? resolvedTheme : undefined);
  const Icon = target === "light" ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={target === "light" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(target)}
      className={cn(
        "orbit-transition inline-flex size-9 cursor-pointer items-center justify-center rounded-pill border border-line-3 text-text-2 hover:border-line-hover hover:text-text",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
    </button>
  );
}
