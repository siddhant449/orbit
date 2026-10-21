import type { ReactNode } from "react";
import { cn } from "@brandloop/ui";

/** Sticky page header: opaque surface, title-2 after a short keyline rule (riso-system.md section 9). */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface px-6">
      <h1 className="type-title-2 flex items-center gap-3 focus-visible:outline-none">
        <span aria-hidden="true" className="h-5 w-px bg-keyline" />
        {title}
      </h1>
      {actions}
    </header>
  );
}

/** Placeholder for screens that arrive in a later feature. Says what the screen will do. */
export function Upcoming({ title, description, points }: { title: string; description: string; points: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="type-body text-ink">{description}</p>
        <ul className="mt-6 space-y-2.5 border-l border-keyline pl-4">
          {points.map((point) => (
            <li key={point} className="type-ui text-ink-muted">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-3xl px-6 py-8", className)}>{children}</div>;
}
