import type { ComponentProps } from "react";
import { cn } from "../cn";

/**
 * Action chip (system §6.4): a 32-36 px pill with a `line-3` outline that inverts on hover and lifts 1 px. `selected`
 * pre-inverts it (the first suggestion, a selected filter). Render as a button by default; for a link, wrap the text
 * in an `<a>` with `pillClass()`.
 */
export function pillClass({ selected = false, className }: { selected?: boolean; className?: string } = {}) {
  return cn(
    "orbit-transition inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-pill border px-3.5 text-[13px] font-medium",
    "motion-safe:hover:-translate-y-px hover:border-inverse hover:bg-inverse hover:text-on-inverse",
    selected ? "border-inverse bg-inverse text-on-inverse" : "border-line-3 text-text",
    className,
  );
}

export function Pill({ selected, className, type = "button", ...props }: ComponentProps<"button"> & { selected?: boolean }) {
  return <button type={type} aria-pressed={selected} className={pillClass({ selected, className })} {...props} />;
}
