import type { ComponentProps } from "react";
import { cn } from "../cn";

/**
 * Status pills (system §6.4). `neutral`: 24 px, `line-4` outline, `text-soft`, 11 px ("4 left", "3 to review").
 * `accent`: accent wash with a 6 px leading dot, 13 px / 500 ("Approved"), both themes. `danger`: errors only, a
 * neutral pill with danger text. `mono`: the data register (system §4), mono 12 px +0.04em.
 */
export function StatusPill({
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "accent" | "danger" | "mono" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill",
        tone === "neutral" && "min-h-6 border border-line-4 px-2.5 text-[11px] text-text-soft",
        tone === "accent" && "min-h-8 bg-accent-wash px-3 text-[13px] font-medium text-accent-text",
        tone === "danger" && "min-h-6 border border-line-4 px-2.5 text-[11px] text-danger",
        tone === "mono" && "min-h-7 border border-line-4 px-3 font-mono text-xs tracking-[0.04em] text-text-soft",
        className,
      )}
      {...props}
    >
      {tone === "accent" && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent-text" />}
      {children}
    </span>
  );
}
