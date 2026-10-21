import { cn } from "../cn";

/** Static film grain (system §2.5): screen at 7 % in dark, multiply at 5 % in light. Fills its positioned parent. */
export function Grain({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("orbit-grain", className)} />;
}
