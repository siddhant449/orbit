import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Grain, LineReveal, Logo } from "@brandloop/ui";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { ComponentsCard } from "./sections/components-card";
import { FoundationsSection } from "./sections/foundations";
import { MotionSection } from "./sections/motion";
import { TokensSection } from "./sections/tokens";
import { TypeSection } from "./sections/type";

export const metadata: Metadata = { title: "Design system" };

const sections = [
  { id: "tokens", label: "Tokens" },
  { id: "type", label: "Type" },
  { id: "radii", label: "Radii" },
  { id: "icons", label: "Icons" },
  { id: "components", label: "Components" },
  { id: "motion", label: "Motion" },
];

export default function DesignPage() {
  // Public only outside production (see proxy.ts); a production build serves a 404 here.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-ground text-text">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ background: "var(--ambient-glow)" }} />
      <Grain className="-z-10" />
      <div className="mx-auto flex max-w-[1328px] flex-col gap-12 px-4 pb-20 pt-6 sm:px-8 md:gap-16 lg:px-16">
        <header className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <ThemeSwitch className="w-full max-w-[260px]" />
          </div>
          <div className="flex flex-col gap-6">
            <p className="text-[13px] text-text-2">Orbit · design system · development only (not found in production)</p>
            <LineReveal as="h1" lines={["Orbit design system"]} className="type-section max-w-[14ch]" />
            <p className="type-lead max-w-[46ch] text-text-2">
              Cinematic marketing and a studio app on one type system and one accent. The app ships dark by default with
              a light theme; every value below is read from the live stylesheet.
            </p>
            <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="orbit-transition inline-flex h-8 items-center rounded-pill border border-line-2 px-3.5 text-[13px] text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse motion-safe:hover:-translate-y-px"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <TokensSection />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <TypeSection />
          <FoundationsSection />
        </div>

        <section id="components" aria-labelledby="components-title" className="scroll-mt-6">
          <h2 id="components-title" className="sr-only">
            Components
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-5">
            <ComponentsCard theme="dark" />
            <ComponentsCard theme="light" />
          </div>
        </section>

        <MotionSection />

        <footer className="border-t border-line pt-8">
          <p className="text-[13px] text-text-3">Source of truth: docs/design/orbit/system.md.</p>
        </footer>
      </div>
    </main>
  );
}
