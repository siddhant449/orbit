import type { ReactNode } from "react";
import { StatusPill, cn } from "@brandloop/ui";

/**
 * Orbit page header (screens.md B12, p14): `page-title` h1, an optional one-line subtitle in `text-2`, actions on the
 * right. Not sticky: Orbit's sectioned screens scroll as one sheet. Left-aligned to the main padding (`28px 32px`); pass the same `max-w-*` as the `PageBody` so actions line up with it.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("w-full max-w-[880px] px-(--gutter) pt-6 md:pt-8", className)}>
      {/* Actions sit on the title's line, centred on it (not on the subtitle's last line), and wrap under it when narrow. */}
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="type-page-title min-w-0 text-text focus-visible:outline-none">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.55] text-text-2">{subtitle}</p>}
    </header>
  );
}

/** Main column under a `PageHeader`: same left edge, `max-width` per screen (forms 760, lists 880, grids 1120). */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("w-full max-w-[880px] px-(--gutter) pb-16 pt-8", className)}>{children}</div>;
}

/** Section heading inside a page (p14 "Social accounts"): 14 / 500 `text-2`, an optional note after a separator. */
export function SectionHeading({ id, title, note }: { id?: string; title: string; note?: string }) {
  return (
    <h2 id={id} className="mb-3 text-[14px] font-medium text-text-2">
      {title}
      {note && <span className="font-normal text-text-3"> · {note}</span>}
    </h2>
  );
}

/** Orbit empty state (system §6.6): a panel with a `card-title`, one or two sentences in `text-2`, an optional action. */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-empty-state=""
      className={cn("orbit-panel flex flex-col items-center gap-3 px-6 py-10 text-center md:px-8 md:py-12", className)}
    >
      <h2 className="type-card-title text-text">{title}</h2>
      <div className="max-w-[52ch] text-[14px] leading-[1.6] text-text-2">{body}</div>
      {action && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </section>
  );
}

/**
 * Placeholder for a screen that arrives later (screens.md B14): the page title, one line on what the screen is for,
 * and a dashed "coming soon" panel listing what it will do. No sample data.
 */
export function Upcoming({ title, description, points }: { title: string; description: string; points: string[] }) {
  const id = `upcoming-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <>
      <PageHeader title={title} subtitle={description} />
      <PageBody>
        <section aria-labelledby={id} className="rounded-card border border-dashed border-line-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={id} className="type-card-title text-text">
              What&apos;s coming
            </h2>
            <StatusPill>Coming soon</StatusPill>
          </div>
          <ul className="mt-5 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-baseline gap-3 text-[14px] leading-[1.55] text-text-soft">
                <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-text-3" />
                {point}
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}
