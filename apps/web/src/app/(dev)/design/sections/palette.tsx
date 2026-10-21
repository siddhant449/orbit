import type { ReactNode } from "react";
import { TokenHex } from "../token-hex";

type Swatch = { token: string; role: string; block: ReactNode };
type Group = { title: string; note?: string; cols: string; swatches: Swatch[] };

const blockBase = "flex min-h-[132px] flex-col justify-center gap-0.5 border border-keyline px-3 py-3";

/** A background token with the text tones allowed on it (docs/design/system.md section 2.4). */
function Stock({ bg, faint = true }: { bg: string; faint?: boolean }) {
  return (
    <div className={`${blockBase} ${bg}`}>
      <p className="type-caption text-ink">Ink text</p>
      <p className="type-caption text-ink-muted">Muted text</p>
      {faint && <p className="type-caption text-ink-faint">Faint text</p>}
      <p className="type-caption text-signal-ink">Signal text (status)</p>
    </div>
  );
}

/** A text token shown as text on paper. */
function TextInk({ text }: { text: string }) {
  return (
    <div className={`${blockBase} bg-paper`}>
      <p className={`type-title-3 ${text}`}>The quick brown fox</p>
      <p className={`type-caption ${text}`}>jumps over the lazy dog, 0123456789</p>
    </div>
  );
}

/** A rule token drawn as hairlines on the surface. */
function Rule({ border }: { border: string }) {
  return (
    <div aria-hidden className={`${blockBase} gap-4 bg-surface`}>
      <span className={`block h-px w-full border-t ${border}`} />
      <span className={`block h-10 w-full border ${border}`} />
      <span className={`block h-px w-2/3 border-t ${border}`} />
    </div>
  );
}

/** A plate and the text token that belongs on it. */
function OnPlate({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <div className={`${blockBase} ${bg}`}>
      <p className={`type-title-1 ${text}`}>Aa</p>
      <p className={`type-caption ${text}`}>{label}</p>
    </div>
  );
}

const groups: Group[] = [
  {
    title: "Stocks",
    cols: "lg:grid-cols-3",
    note: "The desk, the sheet and sunk fields. Every text tone passes AA on all three.",
    swatches: [
      { token: "--paper", role: "The desk: html and body, sidebar, the construction grid's ground, auth background.", block: <Stock bg="bg-paper" /> },
      { token: "--surface", role: "The sheet: app card, dialogs, popovers, inputs at rest.", block: <Stock bg="bg-surface" /> },
      { token: "--surface-sunk", role: "Sunk fields: hover rows, keycaps, skeleton base, selected tab well.", block: <Stock bg="bg-surface-sunk" /> },
    ],
  },
  {
    title: "Ink",
    cols: "lg:grid-cols-3",
    note: "Graphite carries text, icons, keylines and primary actions. There is no coloured accent.",
    swatches: [
      { token: "--ink", role: "Text, icons, plate edges, the primary button face, links and the focus ring.", block: <TextInk text="text-ink" /> },
      { token: "--ink-muted", role: "Secondary text, descriptions, navigation at rest.", block: <TextInk text="text-ink-muted" /> },
      { token: "--ink-faint", role: "Placeholders and hints, on paper, surface and sunk only.", block: <TextInk text="text-ink-faint" /> },
    ],
  },
  {
    title: "Lines",
    cols: "lg:grid-cols-3",
    note: "Hairlines are the structure: construction grids, dividers, rules, dimension lines, plate edges.",
    swatches: [
      { token: "--line", role: "Decorative hairlines: dividers, table rules, the construction grid, ruled margins.", block: <Rule border="border-line" /> },
      { token: "--line-strong", role: "Boundaries that must be perceived: input borders, tick marks, crosshair marks, the button plate.", block: <Rule border="border-line-strong" /> },
      { token: "--keyline", role: "The 1 px edge of a plate: sheets, dialogs, menus, monograms, selected rows.", block: <Rule border="border-keyline" /> },
    ],
  },
  {
    title: "Signal",
    cols: "lg:grid-cols-3",
    note: "One red, for status only: errors, destructive actions, live or active indicators. Never decoration, never a brand accent.",
    swatches: [
      {
        token: "--signal",
        role: "Graphic status: the live dot, the destructive frame, an error border. Not for text.",
        block: (
          <div aria-hidden className={`${blockBase} gap-3 bg-surface`}>
            <span className="flex items-center gap-2 type-caption text-ink">
              <span className="size-2 rounded-pill bg-signal" />
              Live
            </span>
            <span className="type-caption inline-flex h-8 w-fit items-center rounded-control border border-signal px-3 text-signal-ink">Delete profile</span>
          </div>
        ),
      },
      { token: "--signal-ink", role: "Status text: error messages, destructive labels. 5.4:1 on paper by day, 5.8:1 at night.", block: <TextInk text="text-signal-ink" /> },
      {
        token: "--signal-soft",
        role: "Tinted stock behind an error callout or a destructive hover; ink or signal text on it.",
        block: (
          <div className={`${blockBase} bg-signal-soft`}>
            <p className="type-caption text-ink">Couldn&apos;t save your strategy.</p>
            <p className="type-caption text-signal-ink">Check the connection and try again.</p>
          </div>
        ),
      },
    ],
  },
  {
    title: "On plates",
    cols: "lg:grid-cols-3",
    note: "Paper text on graphite; at night the plate is light and its text is dark paper.",
    swatches: [
      { token: "--on-ink", role: "Text on a graphite plate: primary buttons, the current nav row, inverted menu rows.", block: <OnPlate bg="bg-ink" text="text-on-ink" label="On ink" /> },
      {
        token: "--ghost",
        role: "Ghost display type (the clipped index label) and nothing else.",
        block: (
          <div aria-hidden data-text="Index" className={`${blockBase} overflow-hidden bg-paper before:content-[attr(data-text)] before:type-display-2 before:text-ghost`} />
        ),
      },
      {
        token: "--focus",
        role: "The focus ring, graphite, with a paper halo on graphite plates.",
        block: (
          <div className={`${blockBase} items-start bg-surface`}>
            <div className="type-caption rounded-card bg-surface px-3 py-2 text-ink outline-2 outline-offset-2 outline-focus">Focus ring</div>
          </div>
        ),
      },
    ],
  },
  {
    title: "Aliases",
    cols: "lg:grid-cols-3",
    note: "Role names that screens use, so a change of ink never means a rewrite.",
    swatches: [
      { token: "--accent", role: "Equals --ink. bg-accent is a graphite plate, text-accent is graphite text.", block: <OnPlate bg="bg-accent" text="text-on-accent" label="On accent" /> },
      { token: "--accent-soft", role: "Equals --surface-sunk. The tinted stock behind a note.", block: <Stock bg="bg-accent-soft" faint={false} /> },
      { token: "--danger", role: "Equals --signal-ink. Destructive text and the error caption under a field.", block: <TextInk text="text-danger" /> },
    ],
  },
];

export function PaletteSection() {
  return (
    <section id="palette" aria-labelledby="palette-title" className="scroll-mt-4 border-t border-line py-12 md:py-16">
      <h2 id="palette-title" className="type-title-1">
        Palette
      </h2>
      <p className="type-body mt-3 max-w-[68ch] text-ink-muted">
        Paper, graphite and hairlines, with one red held back for status. Values are read from the live stylesheet in the
        active theme.
      </p>
      <div className="mt-10 space-y-14">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="type-title-3">{group.title}</h3>
            {group.note && <p className="type-caption mt-1 max-w-[60ch] text-ink-muted">{group.note}</p>}
            <ul className={`mt-5 grid gap-x-6 gap-y-8 ${group.cols}`}>
              {group.swatches.map((s) => (
                <li key={s.token} className="min-w-0">
                  {s.block}
                  <p className="type-caption mt-3 flex flex-wrap items-baseline justify-between gap-x-4 text-ink">
                    <span>{s.token}</span>
                    <TokenHex name={s.token} />
                  </p>
                  <p className="type-caption mt-1 max-w-[44ch] text-ink-muted">{s.role}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
