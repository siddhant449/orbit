import type { ReactNode } from "react";
import { cn } from "@brandloop/ui";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-6 backdrop-blur">
      <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</h1>
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
        <p className="text-[15px] leading-relaxed text-ink">{description}</p>
        <ul className="mt-6 space-y-2.5 border-l-2 border-accent-soft pl-4">
          {points.map((point) => (
            <li key={point} className="text-sm leading-relaxed text-ink-muted">
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
