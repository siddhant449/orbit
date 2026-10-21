import type { ReactNode } from "react";
import { LineArt, cn } from "@brandloop/ui";

/** Sticky page header: opaque surface, title-2 after a short rule; the bottom rule draws in (system.md section 9). */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="relative sticky top-0 z-10 flex h-14 items-center justify-between bg-surface px-6">
      <h1 className="type-title-2 flex items-center gap-3 focus-visible:outline-none">
        <span aria-hidden="true" className="rule-draw rule-draw--y h-5 w-px bg-keyline" />
        {title}
      </h1>
      {actions}
      <span aria-hidden="true" className="rule-draw absolute inset-x-0 bottom-0 h-px bg-line" />
    </header>
  );
}

/** Corner marks for a framed figure (system.md section 5.3). */
export function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <span aria-hidden="true" className="crosshair crosshair--local -left-[5px] -top-[5px]" />
      <span aria-hidden="true" className="crosshair crosshair--local -right-[5px] -top-[5px]" />
      <span aria-hidden="true" className="crosshair crosshair--local -bottom-[5px] -left-[5px]" />
      <span aria-hidden="true" className="crosshair crosshair--local -bottom-[5px] -right-[5px]" />
      {children}
    </div>
  );
}

/** Placeholder for screens that arrive in a later feature. Says what the screen will do. */
export function Upcoming({ title, description, points }: { title: string; description: string; points: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16 md:grid-cols-[1fr_240px] md:items-start">
        <div className="max-w-xl">
          <p className="type-body text-ink">{description}</p>
          <ul className="mt-6 space-y-2.5 border-l border-keyline pl-4">
            {points.map((point) => (
              <li key={point} className="type-ui text-ink-muted">
                {point}
              </li>
            ))}
          </ul>
        </div>
        <Frame className="mx-auto hidden w-[240px] text-ink-muted md:block">
          <LineArt name="stack" />
        </Frame>
      </div>
    </>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-3xl px-6 py-8", className)}>{children}</div>;
}
