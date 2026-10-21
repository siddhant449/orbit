import type { CSSProperties, ReactNode } from "react";

// Static recipes from docs/design/riso-system.md section 5. No components yet: the classes come from tokens.css.

function Specimen({ title, children, caption }: { title: string; children: ReactNode; caption: string }) {
  return (
    <li className="min-w-0 border-t border-line pt-6">
      <h3 className="type-title-3">{title}</h3>
      <div className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-6">{children}</div>
      <p className="type-caption mt-4 max-w-[44ch] text-ink-muted">{caption}</p>
    </li>
  );
}

function ElevationPlate({ cls, label }: { cls: string; label: string }) {
  return (
    <div className={`plate type-caption grid h-20 w-24 place-items-center text-ink ${cls}`}>
      <span>{label}</span>
    </div>
  );
}

const grainUse: CSSProperties = {
  opacity: "var(--grain-opacity)",
  mixBlendMode: "var(--grain-blend)" as CSSProperties["mixBlendMode"],
};

export function DevicesSection() {
  return (
    <section id="devices" aria-labelledby="devices-title" className="scroll-mt-4 border-t border-line py-12 md:py-16">
      <h2 id="devices-title" className="type-title-1">
        Printing devices
      </h2>
      <p className="type-body mt-3 max-w-[68ch] text-ink-muted">
        Hard edges, hard offset shadows, grain at rest. No gradients, blur or glow. Each specimen is plain CSS from the
        system, ready for the components that come next.
      </p>
      <ul className="mt-10 grid gap-x-12 gap-y-12 md:grid-cols-2">
        <Specimen
          title="Keyline and ink shadow"
          caption="Elevation is a 1 px keyline and a hard offset plate: flat, popover at 2 px, raised at 4 px, overlay at 6 px. Nothing lifts on hover."
        >
          <ElevationPlate cls="" label="Flat" />
          <ElevationPlate cls="plate--sm" label="Popover" />
          <ElevationPlate cls="plate--raised" label="Raised" />
          <ElevationPlate cls="plate--overlay" label="Overlay" />
        </Specimen>

        <Specimen
          title="Overprint"
          caption="Live overprint blends a blue plate at 70% with a pink plate at 84% so the overlap lands on the purple token. The flat square is the token itself, used for fills."
        >
          <div aria-hidden className="overprint relative h-28 w-44">
            <span className="plate-blue absolute left-0 top-0 size-16" />
            <span className="plate-pink absolute left-12 top-10 size-16" />
          </div>
          <div className="flex flex-col gap-2">
            <div aria-hidden className="size-16 border border-keyline bg-overprint" />
            <p className="type-caption text-ink-muted">Flat fill</p>
          </div>
        </Specimen>

        <Specimen
          title="Misregistration"
          caption="Pink and blue copies of display text sit 3 px off the ink line. Smaller text and UI never misregister."
        >
          <p className="misreg type-display-2" data-size="display-2">
            Out of register
            <span aria-hidden className="misreg__pink">
              Out of register
            </span>
            <span aria-hidden className="misreg__blue">
              Out of register
            </span>
          </p>
        </Specimen>

        <Specimen
          title="Grain"
          caption="One 128 px noise tile over the desk and the sheet. The first square shows it at full strength; the second at print strength, 7% by day and 9% at night."
        >
          <div className="flex flex-col gap-2">
            <div
              aria-hidden
              className="size-32 border border-keyline"
              style={{ backgroundColor: "var(--paper)", backgroundImage: "var(--grain-tile)", backgroundSize: "128px 128px" }}
            />
            <p className="type-caption text-ink-muted">Full strength</p>
          </div>
          <div className="flex flex-col gap-2">
            <div aria-hidden className="relative isolate size-32 border border-keyline bg-paper">
              <div
                className="absolute inset-0"
                style={{ ...grainUse, backgroundImage: "var(--grain-tile)", backgroundSize: "128px 128px" }}
              />
            </div>
            <p className="type-caption text-ink-muted">Print strength</p>
          </div>
        </Specimen>

        <Specimen
          title="Halftone skeleton"
          caption="Loading blocks are a dot grid with a hard-edged paper band sweeping across, not a shimmer. The band stops under reduced motion."
        >
          <div aria-hidden className="flex w-full max-w-[420px] flex-col gap-3">
            <div className="skeleton h-7 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        </Specimen>
      </ul>
    </section>
  );
}
