import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevicesSection } from "./sections/devices";
import { PaletteSection } from "./sections/palette";
import { TypeSection } from "./sections/type";
import { ThemeToggle } from "./theme-toggle";

export const metadata: Metadata = { title: "Style guide" };

const sections = [
  { id: "palette", label: "Palette" },
  { id: "type", label: "Type" },
  { id: "devices", label: "Drafting devices" },
];

export default function DesignPage() {
  // Public only outside production (see proxy.ts); a production build serves a 404 here.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="md:m-3">
      <div className="min-h-svh bg-surface md:min-h-[calc(100svh-24px)] md:rounded-card md:border md:border-keyline md:shadow-raised">
        <div className="mx-auto max-w-[1120px] px-4 md:px-12">
          <header className="py-8 md:py-12">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="type-caption max-w-[44ch] text-ink-muted">
                Development only. This page returns not found in production.
              </p>
              <ThemeToggle />
            </div>
            <h1 className="type-display-1 mt-10">Drafting table</h1>
            <p className="type-body mt-6 max-w-[68ch]">
              The design system for Brandloop: paper, graphite and hairlines, laid out like a drafting sheet. One red is
              held back for status. Every token, type step and device below renders in the active theme, so switch
              between day and night to compare.
            </p>
            <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-x-6">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="type-ui inline-flex min-h-11 items-center font-medium text-ink underline-offset-4 hover:underline focus-visible:underline"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </header>
          <PaletteSection />
          <TypeSection />
          <DevicesSection />
          <footer className="border-t border-line py-10">
            <p className="type-caption max-w-[44ch] text-ink-muted">
              Source of truth: docs/design/system.md. Values on this page are read from the live stylesheet.
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
