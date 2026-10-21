import type { ReactNode } from "react";
import { Button, KineticHeading, LineArt } from "@brandloop/ui";
import { Frame } from "@/components/page";

// Drafting devices from docs/design/system.md section 5: recipes in tokens.css and drafting.css.

function Specimen({ title, children, caption }: { title: string; children: ReactNode; caption: string }) {
  return (
    <li className="min-w-0 border-t border-line pt-6">
      <h3 className="type-title-3">{title}</h3>
      <div className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-6">{children}</div>
      <p className="type-caption mt-4 max-w-[44ch] text-ink-muted">{caption}</p>
    </li>
  );
}

export function DevicesSection() {
  return (
    <section id="devices" aria-labelledby="devices-title" className="scroll-mt-4 border-t border-line py-12 md:py-16">
      <h2 id="devices-title" className="type-title-1">
        Drafting devices
      </h2>
      <p className="type-body mt-3 max-w-[68ch] text-ink-muted">
        Hairline grids, measured lines with ticks, crosshair marks, monochrome line drawings and graphite plates. No
        gradients, blur, glow or colour. Each specimen is plain CSS or SVG from the system.
      </p>
      <ul className="mt-10 grid gap-x-12 gap-y-12 md:grid-cols-2">
        <Specimen title="Construction grid" caption="The desk carries a 32 px hairline grid at 55% of the line tone. The sheet covers it; nothing is set on top of it except the index.">
          <div aria-hidden className="desk-grid h-40 w-full max-w-[420px] border border-line bg-paper" />
        </Specimen>

        <Specimen title="Crosshair marks" caption="11 px crosses in the strong line tone at the four corners of the desk and around framed figures. Thin, exact, never on data.">
          <Frame className="h-40 w-full max-w-[420px] border border-line bg-surface">
            <div className="grid h-full place-items-center type-caption text-ink-muted">framed figure</div>
          </Frame>
        </Specimen>

        <Specimen title="Dimension line" caption="A hairline with end ticks and a measured label, drawn in from the left. It states a real measure: here the width of the specimen.">
          <div className="w-full max-w-[420px]">
            <div aria-hidden className="h-16 border border-line bg-surface" />
            <span aria-hidden className="dim dim--draw mt-4 block" style={{ "--draw-delay": "200ms" } as React.CSSProperties}>
              <span className="dim__label">420</span>
            </span>
          </div>
        </Specimen>

        <Specimen title="Ruled margin" caption="The sheet's left margin: a hairline with ticks every 32 px and a longer tick every 128 px, the way a drafting sheet is ruled.">
          <div aria-hidden className="relative h-40 w-full max-w-[420px] border border-line bg-surface">
            <span className="ruler" />
          </div>
        </Specimen>

        <Specimen title="Elevation" caption="Flat is a hairline. Raised and overlay plates add a single 1 px graphite offset. Nothing blurs and nothing lifts on hover.">
          <div className="plate type-caption grid h-20 w-28 place-items-center text-ink">Flat</div>
          <div className="plate plate--raised type-caption grid h-20 w-28 place-items-center text-ink">Raised</div>
          <div className="plate plate--overlay type-caption grid h-20 w-28 place-items-center text-ink">Overlay</div>
        </Specimen>

        <Specimen title="Graphite press" caption="Primary actions are a graphite face on a 2 px plate; the face lands on the plate when pressed. Secondary and destructive actions are hairline frames; the destructive frame is the only signal red.">
          <Button>Save changes</Button>
          <Button variant="secondary">Import memories</Button>
          <Button variant="danger">Delete profile</Button>
          <Button variant="ghost">Cancel</Button>
        </Specimen>

        <Specimen title="Line drawings" caption="Monochrome ink line art in the current text colour, every stroke drawn in sequence. Used for the hero and empty states; complete at once under reduced motion.">
          <div className="w-[200px] text-ink-muted">
            <LineArt name="sheet" delay={200} />
          </div>
          <div className="w-[200px] text-ink-muted">
            <LineArt name="stack" delay={400} />
          </div>
          <div className="w-[200px] text-ink-muted">
            <LineArt name="compass" delay={600} />
          </div>
        </Specimen>

        <Specimen title="Kinetic heading" caption="Display type sets in letter by letter, from light and tracked-out to its weight and tight tracking. The accessible name is the whole sentence.">
          <KineticHeading as="h4" text="Measured twice" lines={["Measured twice"]} className="type-display-2 text-ink" delay={300} />
        </Specimen>

        <Specimen title="Monogram" caption="Avatars are graphite line monograms: a hairline frame with the initials in ink. Presets vary the ring weight; photos replace the initials.">
          <span aria-hidden data-initials="TA" className="grid size-10 place-items-center rounded-control border border-keyline bg-surface type-caption text-ink before:content-[attr(data-initials)]" />
          <span aria-hidden data-initials="CS" className="grid size-10 place-items-center rounded-pill border-2 border-keyline bg-surface type-caption text-ink before:content-[attr(data-initials)]" />
          <span aria-hidden data-initials="PL" className="grid size-10 place-items-center rounded-pill border border-keyline bg-surface type-caption text-ink before:content-[attr(data-initials)]" />
        </Specimen>

        <Specimen title="Skeleton" caption="Loading blocks are sunk bars with a single hairline sweeping across. The sweep stops under reduced motion.">
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
