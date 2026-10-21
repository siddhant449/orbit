import type { ReactNode } from "react";
import { cn } from "@brandloop/ui";

/**
 * Screen top bar (system §6.10): `18px 32px`, a breadcrumb in 13 px `text-3` (or a title) on the left and small pill
 * actions on the right.
 */
export function TopBar({
  title,
  crumb,
  actions,
  className,
}: {
  title?: ReactNode;
  crumb?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex min-h-[68px] items-center justify-between gap-4 px-8 py-[18px]", className)}>
      <div className="flex min-w-0 items-baseline gap-3">
        {crumb && <span className="text-[13px] text-text-3">{crumb}</span>}
        {title}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Small chrome pill (system §6.3 `pill-sm`): 32 px, `line-2` outline, inverts on hover with a 1 px lift. */
export const pillSmClass =
  "orbit-transition inline-flex h-8 items-center gap-2 rounded-pill border border-line-control px-3.5 text-[13px] text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse motion-safe:hover:-translate-y-px data-[state=open]:border-inverse data-[state=open]:bg-inverse data-[state=open]:text-on-inverse";
