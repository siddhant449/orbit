import type { ComponentProps } from "react";
import { cn } from "../cn";

/**
 * Composer box (system §6.5): `panel` fill, `line-2` border, radius 22 (home) or 20 (thread), composer shadow, and the
 * focus aura: a blurred conic gradient that fades to .42 and turns once every 5 s while focus is inside. The spin is
 * paused at rest; reduced motion keeps the aura static. Content (textarea, footer row) is the caller's.
 */
export function ComposerShell({
  variant = "home",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: "home" | "thread" }) {
  return <div className={cn("orbit-composer", variant === "thread" && "orbit-composer--thread", className)} {...props} />;
}
