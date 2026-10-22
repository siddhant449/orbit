import Link from "next/link";
import { Button, StatusPill } from "@brandloop/ui";

/**
 * The Ideas section's not-yet-built screens (screens.md B11: Swipe file, Following, Hooks, All saves), in the p13
 * grammar: the 34 px title, one line on what the screen is, then an honest panel saying what will appear here and what
 * it needs. No sample posts, creators or numbers (ruling A14). The way forward today is this week's ideas.
 */
export function LibraryEmpty({
  title,
  description,
  heading,
  points,
  needs,
}: {
  title: string;
  description: string;
  /** What this screen will hold, as a sentence (the panel heading). */
  heading: string;
  points: string[];
  /** What has to exist before it fills up. */
  needs: string;
}) {
  const id = `library-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-4 px-5 pb-16 pt-8 md:px-7 md:pt-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="type-page-title text-[34px] text-text focus-visible:outline-none">{title}</h1>
        <p className="max-w-[64ch] text-[14px] text-text-2">{description}</p>
      </header>
      <section aria-labelledby={id} className="mt-2 grid gap-6 rounded-card border border-dashed border-line-3 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:p-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={id} className="type-card-title text-text">
              {heading}
            </h2>
            <StatusPill>Coming soon</StatusPill>
          </div>
          <ul className="mt-5 flex max-w-[62ch] flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-baseline gap-3 text-[14px] leading-[1.55] text-text-soft">
                <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-text-3" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-5 max-w-[62ch] text-[13px] leading-[1.55] text-text-3">{needs}</p>
        </div>
        <div className="flex items-end">
          <Button asChild variant="paper" className="max-md:w-full">
            <Link href="/ideas">Get this week&apos;s ideas</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
