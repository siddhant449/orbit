import type { ReactNode } from "react";
import { TokenHex } from "../token-hex";

type Swatch = { token: string; role: string; block: ReactNode };
type Group = { title: string; note?: string; cols: string; swatches: Swatch[] };

const blockBase = "flex min-h-[132px] flex-col justify-center gap-0.5 border border-keyline px-3 py-3";

/** A background token with the text inks that are allowed on it (docs/design/riso-system.md section 2.4). */
function Stock({ bg, faint = false }: { bg: string; faint?: boolean }) {
  return (
    <div className={`${blockBase} ${bg}`}>
      <p className="type-caption text-ink">Ink text</p>
      <p className="type-caption text-ink-muted">Muted text</p>
      {faint && <p className="type-caption text-ink-faint">Faint text</p>}
      <p className="type-caption text-blue">Blue link</p>
      <p className="type-caption text-danger">Danger text</p>
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

/** A plain fill. Pink and the ghost tone never carry text, so the block is empty. */
function Fill({ bg }: { bg: string }) {
  return <div aria-hidden className={`${blockBase} ${bg}`} />;
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

function Line({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className={`${blockBase} items-stretch bg-surface`}>
      {children}
    </div>
  );
}

const groups: Group[] = [
  {
    title: "Stocks",
    cols: "lg:grid-cols-3 xl:grid-cols-5",
    note: "Paper and tinted stock carry text. Faint text is allowed only on paper, surface and sunk.",
    swatches: [
      { token: "--paper", role: "The desk: html and body, sidebar, auth background.", block: <Stock bg="bg-paper" faint /> },
      { token: "--surface", role: "The sheet: app card, dialogs, popovers, inputs at rest.", block: <Stock bg="bg-surface" faint /> },
      { token: "--surface-sunk", role: "Sunk fields: hover rows, keycaps, skeleton base, selected tab well.", block: <Stock bg="bg-surface-sunk" faint /> },
      { token: "--stock-pink", role: "Pink-tinted stock: the selected voice row, person callouts.", block: <Stock bg="bg-stock-pink" /> },
      { token: "--stock-blue", role: "Blue-tinted stock: AI callouts, generated notes.", block: <Stock bg="bg-stock-blue" /> },
    ],
  },
  {
    title: "Text inks",
    cols: "lg:grid-cols-3",
    swatches: [
      { token: "--ink", role: "Text, icons, keylines and the primary button face.", block: <TextInk text="text-ink" /> },
      { token: "--ink-muted", role: "Secondary text, descriptions, navigation at rest.", block: <TextInk text="text-ink-muted" /> },
      { token: "--ink-faint", role: "Placeholders, hints, skeleton dots. Never on tinted stock.", block: <TextInk text="text-ink-faint" /> },
    ],
  },
  {
    title: "Lines",
    cols: "lg:grid-cols-4",
    swatches: [
      {
        token: "--line",
        role: "Decorative hairlines: dividers and table rules. Never a required boundary.",
        block: (
          <Line>
            <div className="border-t border-line" />
          </Line>
        ),
      },
      {
        token: "--line-strong",
        role: "Boundaries that must be perceived: input borders at rest.",
        block: (
          <Line>
            <div className="h-9 border border-line-strong" />
          </Line>
        ),
      },
      {
        token: "--keyline",
        role: "The 1 px printed edge of plates: buttons, sheets, dialogs.",
        block: (
          <Line>
            <div className="h-9 border border-keyline" />
          </Line>
        ),
      },
      {
        token: "--plate-shadow",
        role: "The hard offset shadow plate behind raised surfaces.",
        block: (
          <Line>
            <div className="h-9 w-3/4 border border-keyline bg-surface shadow-raised" />
          </Line>
        ),
      },
    ],
  },
  {
    title: "Spot inks",
    cols: "lg:grid-cols-3",
    note: "Pink is the person and never text. Blue is Brandloop and carries text. Overprint is for large type and flat fills.",
    swatches: [
      { token: "--pink", role: "The person: selection, profile, memories, edits. Ink text sits on it.", block: <Fill bg="bg-pink" /> },
      { token: "--blue", role: "Brandloop's AI and the system: generated content, links, focus.", block: <Fill bg="bg-blue" /> },
      { token: "--overprint", role: "Where person and AI meet: the voice in use, confirmation.", block: <Fill bg="bg-overprint" /> },
      { token: "--danger", role: "Destructive and failed: delete buttons, errors.", block: <Fill bg="bg-danger" /> },
      {
        token: "--highlight",
        role: "The highlighter plate behind ink text. One phrase per screen.",
        block: (
          <div className={`${blockBase} bg-highlight`}>
            <p className="type-body text-ink">Ink on the highlighter</p>
          </div>
        ),
      },
      { token: "--ghost", role: "Ghost display type at 8% ink. Decorative only.", block: <Fill bg="bg-ghost" /> },
    ],
  },
  {
    title: "Text on plates",
    cols: "lg:grid-cols-3 xl:grid-cols-5",
    note: "At night every coloured plate takes dark text. Components use these tokens and never hard-code white on blue.",
    swatches: [
      { token: "--on-ink", role: "Text on an ink plate.", block: <OnPlate bg="bg-ink" text="text-on-ink" label="On ink" /> },
      { token: "--on-pink", role: "Text on a pink plate.", block: <OnPlate bg="bg-pink" text="text-on-pink" label="On pink" /> },
      { token: "--on-blue", role: "Text on a blue plate.", block: <OnPlate bg="bg-blue" text="text-on-blue" label="On blue" /> },
      { token: "--on-overprint", role: "Text on an overprint plate.", block: <OnPlate bg="bg-overprint" text="text-on-overprint" label="On overprint" /> },
      { token: "--on-danger", role: "Text on a danger plate.", block: <OnPlate bg="bg-danger" text="text-on-danger" label="On danger" /> },
    ],
  },
  {
    title: "Aliases",
    cols: "lg:grid-cols-3",
    note: "Names that replaced the old jade tokens, so existing screens re-skin without a rewrite.",
    swatches: [
      { token: "--accent", role: "Equals --blue. Replaces --jade. Used as bg-accent and text-on-accent.", block: <OnPlate bg="bg-accent" text="text-on-accent" label="On accent" /> },
      {
        token: "--accent-soft",
        role: "Equals --stock-blue. Replaces --jade-soft.",
        block: (
          <div className={`${blockBase} bg-accent-soft`}>
            <p className="type-caption text-ink">Ink text</p>
            <p className="type-caption text-accent">Accent text</p>
          </div>
        ),
      },
      {
        token: "--focus",
        role: "Equals --blue. The focus ring colour, with a paper halo on dark plates.",
        block: (
          <div className={`${blockBase} items-start bg-surface`}>
            <div className="type-caption rounded-card bg-surface px-3 py-2 text-ink outline-2 outline-offset-2 outline-focus">
              Focus ring
            </div>
          </div>
        ),
      },
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
        Each entry shows the value in the active theme, what the token means and the text that is allowed on it.
      </p>
      <div className="mt-10 space-y-12">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="type-title-3">{group.title}</h3>
            {group.note && <p className="type-caption mt-1 max-w-[68ch] text-ink-muted">{group.note}</p>}
            <ul className={`mt-4 grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 ${group.cols}`}>
              {group.swatches.map((s) => (
                <li key={s.token} className="min-w-0">
                  {s.block}
                  <p className="type-ui mt-2 font-medium">{s.token}</p>
                  <p className="type-caption text-ink-muted">
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
