import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Orbit inputs (migration §2): ground fill, radius 14, `line-2` border in dark and the solid `line-input` in light,
 * focus ring in accent text. Placeholders use the meta colour.
 */
const control =
  "h-10 w-full rounded-card-sm border border-line-input bg-ground px-3.5 text-sm text-text placeholder:text-text-3 orbit-transition hover:border-line-hover focus-visible:border-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:opacity-40";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "appearance-auto pr-2", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-text", className)} {...props} />;
}

export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs text-text-2", className)} {...props} />;
}
