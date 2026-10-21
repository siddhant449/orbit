# Riso Print: the Brandloop design system

Version 1, written 2026-10-21 (D1.2). Inputs: the approved plan (`~/.claude/plans/immutable-snuggling-deer.md`),
`references.md` (25 references, synthesis, do-not list) and `interaction-research.md` (patterns P01–P40). Companions:
`micro-interactions.md` (motion), `critic-rubric.md` (review), `components.md` (provenance). Values here are the source
of truth for `packages/ui/src/tokens.css` in D2. Fixed by the plan and not open for debate: paper `#F7F6F2`, ink
`#16161D`, pink `#FF4F9A`, blue `#2B3FE0`, overprint `#6B2C9E`, night paper `#121218`, Hanken Grotesk for UI, Lenis,
the motion budget, the slop checklist.

## 1. Concept

1. One sheet of paper, three inks. Ink is for writing and interface, fluorescent pink is the person, federal blue is
   Brandloop's AI; where the two meet they overprint to purple. Colour is authorship, not decoration.
2. Everything is printed: hard edges, hard offset shadows, 1 px keylines, grain visible at rest. No blur, no gradient,
   no glow, anywhere.
3. Scale does the talking: one wide Archivo line against small Hanken text, with nothing in between.
4. The app is a drafting table in a print room, and motion is the press at work: display type sets in letter by letter
   and printed objects land on the table. Every screen has a composition and a motion score (§10). Interaction feedback
   stays instant (≤ 200 ms); the cinema is in the one-shots. Routes switch instantly, with no transition, and the
   pointer is the native cursor.
5. Night print is the same press run on black stock with light inks: overlaps bloom (screen) instead of bruise (multiply).

## 2. Palette

### 2.1 What each ink means

| Ink | Means | Carries text? | Where it appears |
|-----|-------|---------------|------------------|
| ink | the interface and the user's own writing | yes (default) | body, controls, keylines, primary button face |
| pink | the person: their selection, profile, memories, edits, highlighter | never as text (2.84:1 on day paper); ink text sits on it | selected chip/voice/row plate, avatars, source tabs, highlighter, pink plate of any two-plate device |
| blue | Brandloop's AI and the system: generated content, generate actions, links, focus | yes (6.72:1 day, 5.29:1 night) | "Send", "Generate strategy", "Learn my style", links, focus ring, blue plate of any two-plate device |
| overprint | where person and AI meet: a saved edit on a generated thing, the voice in use, confirmation | large text only (display words), never body | donut third segment, "in use" ring, success tick, overlap of plates |
| danger | destructive and failed | yes | delete buttons, errors |

Tinted stocks (`stock-pink`, `stock-blue`) are paper with a trace of ink: section backgrounds and callouts only, ink or
muted text on them, never faint text.

### 2.2 Day print

| Token | Hex | Role | Keep / rename |
|-------|-----|------|---------------|
| `--paper` | `#F7F6F2` | the desk: html/body, sidebar, auth background | keep |
| `--surface` | `#FDFCF9` | the sheet: app card, dialogs, popovers, inputs at rest | keep |
| `--surface-sunk` | `#EFEEE8` | sunk fields: hover rows, kbd, skeleton base, selected tab well | keep |
| `--stock-pink` | `#FBE3EE` | pink-tinted stock for selected voice row, person callouts | new |
| `--stock-blue` | `#E6E9FB` | blue-tinted stock for AI callouts, "generated" notes | new (replaces `--jade-soft`) |
| `--ink` | `#16161D` | text, icons, keylines, primary button face | keep |
| `--ink-muted` | `#585862` | secondary text, descriptions, nav at rest | keep |
| `--ink-faint` | `#686874` | placeholders, hints, skeleton dots (text only on paper/surface/sunk) | keep (darkened to pass) |
| `--line` | `#DAD9D3` | decorative hairlines: dividers, table rules, ghost grid | keep |
| `--line-strong` | `#80808B` | boundaries that must be perceived: input borders at rest, registration crosses | new |
| `--keyline` | `#16161D` | 1 px printed edge of plates: buttons, sheets, dialogs, selected rows | new |
| `--plate-shadow` | `#16161D` | the hard offset shadow plate | new |
| `--pink` | `#FF4F9A` | spot ink 1 | new |
| `--blue` | `#2B3FE0` | spot ink 2; also `--accent` (ex `--jade`) and `--focus` | new; `--jade` → `--accent` |
| `--overprint` | `#6B2C9E` | the designed overprint colour for flat fills | new |
| `--danger` | `#B4261E` | destructive | keep (re-hued to a printed red) |
| `--highlight` | `#FABCD3` | highlighter plate behind ink text (pink at 35 % over paper) | new |
| `--ghost` | `#E5E4E1` | ghost display type, 8 % ink, decorative only | new |
| `--on-ink` | `#F7F6F2` | text on an ink plate | new (ex `--jade-ink` role) |
| `--on-pink` | `#16161D` | text on a pink plate | new |
| `--on-blue` | `#F7F6F2` | text on a blue plate | new |
| `--on-overprint` | `#F7F6F2` | text on an overprint plate | new |
| `--on-danger` | `#F7F6F2` | text on a danger plate | new |
| `--focus` | `#2B3FE0` | focus ring (paired with a 2 px paper halo on dark plates) | keep |

Rename map so screens re-skin rather than rewrite: `--jade` → `--accent` (= `--blue`), `--jade-ink` → `--on-accent`
(= `--on-blue`), `--jade-soft` → `--accent-soft` (= `--stock-blue`). Tailwind utilities follow (`bg-accent`,
`text-on-accent`, `bg-accent-soft`); a one-commit codemod replaces `jade` with `accent`.

### 2.3 Night print (fully specified, not inverted)

Night print is light ink on black stock. The dark ink becomes a warm paper-white, the two spot inks are lifted so
they clear AA against the black stock, keylines and shadows are a softened white so 1 px edges do not glare, and the
overprint is the *screen* of the two night inks (the physical result of translucent light inks overlapping), not a
darkened purple.

| Token | Hex | Night role / note |
|-------|-----|-------------------|
| `--paper` | `#121218` | fixed by plan |
| `--surface` | `#19191F` | the sheet sits a step lighter than the desk |
| `--surface-sunk` | `#0C0C10` | sunk fields drop below the desk |
| `--stock-pink` | `#2B1A25` | tinted black stock |
| `--stock-blue` | `#1A1D33` | tinted black stock |
| `--ink` | `#ECEAE3` | warm paper-white ink |
| `--ink-muted` | `#A9A8B0` | |
| `--ink-faint` | `#83828C` | text only on paper/surface/sunk |
| `--line` | `#2B2B34` | decorative hairline |
| `--line-strong` | `#6A6974` | perceivable boundary |
| `--keyline` | `#B9B8C0` | softened white edge (9.49:1), not full ink, so frames do not glare |
| `--plate-shadow` | `#B9B8C0` | white-ink offset plate |
| `--pink` | `#FF6EB0` | lifted fluorescent pink |
| `--blue` | `#6B7CFF` | lifted blue so it carries text (5.29:1) |
| `--overprint` | `#FFB5FF` | screen(pink, blue): the bloom where light inks overlap |
| `--danger` | `#FF7A70` | |
| `--highlight` | `#65324D` | pink at 35 % over night paper |
| `--ghost` | `#232330` | 8 % ink |
| `--on-ink` | `#121218` | dark text on the light ink plate |
| `--on-pink` | `#16161D` | dark text (6.95:1); light ink would fail (2.15:1) |
| `--on-blue` | `#16161D` | dark text (5.10:1); light ink fails (2.93:1) |
| `--on-overprint` | `#16161D` | dark text (11.41:1) |
| `--on-danger` | `#16161D` | dark text (7.09:1) |
| `--focus` | `#6B7CFF` | with a 2 px night-paper halo on light plates |

Rule that falls out of the numbers: in night print, text on every coloured plate is dark. The `--on-*` tokens encode
this; components never hard-code "white on blue".

### 2.4 Contrast (WCAG 2.x ratios; AA text = 4.5:1, AA large text and non-text = 3:1)

Day print, text on backgrounds:

| Text | on paper | on surface | on sunk | on stock-pink | on stock-blue |
|------|---------:|-----------:|--------:|--------------:|--------------:|
| ink `#16161D` | 16.65 pass | 17.55 pass | 15.49 pass | 14.85 pass | 14.93 pass |
| ink-muted `#585862` | 6.50 pass | 6.85 pass | 6.05 pass | 5.80 pass | 5.83 pass |
| ink-faint `#686874` | 5.08 pass | 5.36 pass | 4.73 pass | 4.53 pass (not allowed) | 4.56 pass (not allowed) |
| blue `#2B3FE0` (links) | 6.72 pass | 7.08 pass | 6.25 pass | 5.99 pass | 6.03 pass |
| overprint `#6B2C9E` (large only) | 7.83 pass | 8.26 pass | 7.29 pass | 6.99 pass | 7.02 pass |
| danger `#B4261E` | 6.00 pass | 6.32 pass | 5.58 pass | 5.35 pass | 5.38 pass |

Day print, text on plates: on-ink 16.65 pass; on-pink (ink) 5.86 pass; on-blue (paper) 6.72 pass; on-overprint
(paper) 7.83 pass; on-danger (paper) 6.00 pass; ink on highlight 11.31 pass; muted on highlight 4.42 **fail**
(highlighter goes under ink text only). Rejected pairs, never used: paper on pink 2.84, ink on blue 2.48, ink on
overprint 2.13, ink on danger 2.77.

Night print, text on backgrounds:

| Text | on paper | on surface | on sunk | on stock-pink | on stock-blue |
|------|---------:|-----------:|--------:|--------------:|--------------:|
| ink `#ECEAE3` | 15.50 pass | 14.54 pass | 16.22 pass | 13.66 pass | 13.76 pass |
| ink-muted `#A9A8B0` | 7.92 pass | 7.43 pass | 8.29 pass | 6.98 pass | 7.03 pass |
| ink-faint `#83828C` | 4.92 pass | 4.61 pass | 5.15 pass | 4.34 **fail** (not allowed) | 4.37 **fail** (not allowed) |
| blue `#6B7CFF` (links) | 5.29 pass | 4.96 pass | 5.53 pass | 4.66 pass | 4.70 pass |
| overprint `#FFB5FF` (large only) | 11.82 pass | 11.09 pass | 12.37 pass | 10.42 pass | 10.50 pass |
| danger `#FF7A70` | 7.35 pass | 6.89 pass | 7.69 pass | 6.47 pass | 6.52 pass |

Night print, text on plates: on-ink 15.50 pass; on-pink 6.95 pass; on-blue 5.10 pass; on-overprint 11.41 pass;
on-danger 7.09 pass; ink on highlight 8.24 pass; muted on highlight 4.21 **fail** (same rule as day).

Non-text (3:1 needed where the boundary or graphic carries meaning):

| Pair | Day | Night | Verdict |
|------|----:|------:|---------|
| pink on paper (graphic) | 2.84 | 7.21 | day: pink never conveys meaning alone; it always pairs with a keyline, label or ink text |
| blue on paper (graphic, focus ring) | 6.72 | 5.29 | pass |
| line-strong on paper / sunk (input borders) | 3.61 / 3.36 | 3.45 / 3.61 | pass |
| keyline on paper / surface | 16.65 / 17.55 | 9.49 / 8.90 | pass |
| line on paper (decorative hairline) | 1.31 | 1.33 | decorative only, never a required boundary |
| pink vs blue, pink vs overprint, blue vs overprint (adjacent donut segments) | 2.37 / 2.76 / 1.17 | 1.36 / 1.64 / 2.24 | adjacent segments are separated by a 2 px paper gap and labelled in the legend; colour is never the only cue |
| focus (blue) on an ink plate | 2.48 | 2.93 | hence the paper halo: `outline: 2px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 2px var(--paper)` |

Lowest passing text pair in the system: night ink-faint on surface, 4.61:1.

### 2.5 Tailwind mapping

`@theme inline` keeps `--color-paper`, `--color-surface`, `--color-surface-sunk`, `--color-ink`, `--color-ink-muted`,
`--color-ink-faint`, `--color-line`, `--color-danger` and adds `--color-line-strong`, `--color-keyline`,
`--color-pink`, `--color-blue`, `--color-overprint`, `--color-accent`, `--color-accent-soft`, `--color-stock-pink`,
`--color-stock-blue`, `--color-highlight`, `--color-on-ink`, `--color-on-pink`, `--color-on-blue`,
`--color-on-overprint`, `--color-on-accent`, `--color-on-danger`. Radii: `--radius-row: 2px`, `--radius-card: 2px`
(names kept so `rounded-row` / `rounded-card` re-skin), `--radius-pill: 999px`. Shadows: `--shadow-sm: 2px 2px 0 0
var(--plate-shadow)`, `--shadow-raised: 4px 4px 0 0 var(--plate-shadow)`, `--shadow-overlay: 6px 6px 0 0
var(--plate-shadow)`. Theme switch stays `next-themes` with `attribute="class"` plus `data-theme` mirrored for CSS.

`tokens.css` skeleton for D2 (values above; theme keys are prefixed so they never collide with the root variables):

```css
/* Brandloop design tokens, Riso Print. Imported by apps after `@import "tailwindcss"`. */
@source "./";

:root { /* day print */
  --paper: #f7f6f2; --surface: #fdfcf9; --surface-sunk: #efeee8; --stock-pink: #fbe3ee; --stock-blue: #e6e9fb;
  --ink: #16161d; --ink-muted: #585862; --ink-faint: #686874;
  --line: #dad9d3; --line-strong: #80808b; --keyline: #16161d; --plate-shadow: #16161d;
  --pink: #ff4f9a; --blue: #2b3fe0; --overprint: #6b2c9e; --danger: #b4261e; --highlight: #fabcd3; --ghost: #e5e4e1;
  --on-ink: #f7f6f2; --on-pink: #16161d; --on-blue: #f7f6f2; --on-overprint: #f7f6f2; --on-danger: #f7f6f2;
  --accent: var(--blue); --on-accent: var(--on-blue); --accent-soft: var(--stock-blue); --focus: var(--blue);
  --misreg: 2px; --radius-control: 2px; --radius-pill: 999px;
  --shadow-sm: 2px 2px 0 0 var(--plate-shadow); --shadow-raised: 4px 4px 0 0 var(--plate-shadow);
  --shadow-overlay: 6px 6px 0 0 var(--plate-shadow);
  --ease-ink: cubic-bezier(.2, .7, .2, 1); --ease-exit: cubic-bezier(.4, 0, .8, .4);
  --grain-opacity: .07; --grain-blend: multiply;
}

:root[data-theme="dark"], .dark { /* night print */
  --paper: #121218; --surface: #19191f; --surface-sunk: #0c0c10; --stock-pink: #2b1a25; --stock-blue: #1a1d33;
  --ink: #eceae3; --ink-muted: #a9a8b0; --ink-faint: #83828c;
  --line: #2b2b34; --line-strong: #6a6974; --keyline: #b9b8c0; --plate-shadow: #b9b8c0;
  --pink: #ff6eb0; --blue: #6b7cff; --overprint: #ffb5ff; --danger: #ff7a70; --highlight: #65324d; --ghost: #232330;
  --on-ink: #121218; --on-pink: #16161d; --on-blue: #16161d; --on-overprint: #16161d; --on-danger: #16161d;
  --grain-opacity: .09; --grain-blend: screen;
}

@theme inline {
  --color-paper: var(--paper); --color-surface: var(--surface); --color-surface-sunk: var(--surface-sunk);
  --color-stock-pink: var(--stock-pink); --color-stock-blue: var(--stock-blue);
  --color-ink: var(--ink); --color-ink-muted: var(--ink-muted); --color-ink-faint: var(--ink-faint);
  --color-line: var(--line); --color-line-strong: var(--line-strong); --color-keyline: var(--keyline);
  --color-pink: var(--pink); --color-blue: var(--blue); --color-overprint: var(--overprint); --color-danger: var(--danger);
  --color-highlight: var(--highlight); --color-accent: var(--accent); --color-accent-soft: var(--accent-soft);
  --color-on-ink: var(--on-ink); --color-on-pink: var(--on-pink); --color-on-blue: var(--on-blue);
  --color-on-overprint: var(--on-overprint); --color-on-accent: var(--on-accent); --color-on-danger: var(--on-danger);
  --font-sans: var(--font-ui), system-ui, sans-serif;
  --font-display: var(--font-display-face), var(--font-ui), sans-serif;
  --radius-row: var(--radius-control); --radius-card: var(--radius-control); --radius-pill: var(--radius-pill);
}

@layer base {
  html { color-scheme: light; } html.dark { color-scheme: dark; }
  body { background: var(--paper); color: var(--ink); font-family: var(--font-sans); font-size: 14px; line-height: 1.45;
         -webkit-font-smoothing: antialiased; }
  .display { font-family: var(--font-display); font-stretch: 125%; font-weight: 800; letter-spacing: -.025em; text-wrap: balance; }
  .tabular { font-variant-numeric: tabular-nums; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .on-plate:focus-visible { box-shadow: 0 0 0 2px var(--paper); }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
                             transition-duration: .01ms !important; }
  }
}
```

## 3. Type

### 3.1 Families

**Display: Archivo at width 125 (Archivo Expanded), weights 800 / 700 / 600.** Archivo (Omnibus-Type, OFL) is a
genuinely extended grotesk, the poster idiom of riso print shops, and on Google Fonts it is variable on both `wdth`
(62–125) and `wght` (100–900) with true italics; `next/font/google` exposes the width axis (`axes: ["wdth"]`), so one
file serves display at 125, section titles at 112 and the 20 px page title at 100, which is how long titles survive
390 px without a second family. Its text-grade proportions keep a 20 px title legible, unlike pure poster faces. The
alternatives fail the brief: Bricolage Grotesque (the current, rejected face) has a width axis that stops at 100, so
"wide Bricolage" does not exist; Unbounded is wide but has no italic and is now the stock crypto-landing face;
Familjen Grotesk has no width axis and tops out at 700; Anybody reaches width 150 but its quirkier forms fight the
restraint the app needs. Checked 2026-10-21: the Google Fonts CSS API accepts `Archivo:wdth,wght@62..125,100..900`,
and next/font's font-data lists `wdth 62–125`, `wght 100–900`, normal + italic. The visual render check at every
size in the scale happens on `/design` (D1.3) and is an item in `critic-rubric.md`.

**UI and body: Hanken Grotesk, weights 400 / 500 / 600.** Fixed by the plan. Checked: the font has no `tnum` feature,
but its default figures are already equal-width (digit advances 559–561 / 1000 em, a ±0.013 px variance at 13 px), so
columns align without it. `font-variant-numeric: tabular-nums` is still declared as a guard; Archivo has `tnum` and
needs it for any counting display number.

No third family. No monospace anywhere (ruling R10): captions, metadata, kbd hints and chips are Hanken at 13 px with
tabular numerals; contrast comes from the wide display face against small text.

```ts
// apps/web/src/app/layout.tsx (D2)
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display-face", display: "swap" });
const ui = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
```

### 3.2 Scale

Two registers with a deliberate gap between them (FORMAT, bleibtgleich): a display register in Archivo that steps by
about 1.5, and a text register in Hanken that steps by 1 px. Sizes in px, line-height unitless, tracking in em.

| Step | Face / weight / width | Size | Line | Tracking | Use | 390 px |
|------|-----------------------|-----:|-----:|---------:|-----|--------|
| display-1 | Archivo 800, 125 | 72 | 0.98 | -0.03 | marketing hero, auth wordmark | clamp(40px, 11vw, 72px) |
| display-2 | Archivo 800, 125 | 48 | 1.02 | -0.025 | home greeting, empty-state headline | clamp(30px, 8vw, 48px) |
| title-1 | Archivo 700, 112 | 28 | 1.1 | -0.02 | strategy section heads, dialog hero line | 24 |
| title-2 | Archivo 600, 100 | 20 | 1.2 | -0.01 | page header title, dialog titles, section panel title | 18 |
| title-3 | Hanken 600 | 16 | 1.3 | 0 | card and group titles ("Identity", "Content mix") | 16 |
| body | Hanken 400 | 15 | 1.6 | 0 | reading text: memory lines, descriptions, strategy prose | 15 |
| ui | Hanken 400 / 500 | 14 | 1.45 | 0 | controls, nav rows, list rows, inputs, buttons | 14 |
| caption | Hanken 500, tabular | 13 | 1.4 | +0.01 | metadata, chips, hints, kbd, legend values, timestamps | 13 |
| micro | Hanken 600, tabular | 11 | 1.3 | +0.02 | counters and badges only; never a sentence | 11 |

Rules: nothing is set between 20 and 28 px except title-1; nothing under 11 px; display steps use `font-stretch: 125%`
(`112%` for title-1) and `text-wrap: balance`; the display face is never used under 18 px; uppercase is used only for
single-letter avatar initials.

### 3.3 Measure and setting

- Reading text max 68 ch; UI rows max 56 ch; captions max 44 ch; display lines max 14 words.
- Paragraph spacing 1 em; no first-line indents; left-aligned everywhere (centred only for auth, empty states and the
  marketing hero).
- Numerals: `font-variant-numeric: tabular-nums` on captions, inputs, table cells, legends and any ticking number.
  Percentages keep the sign tight (`35%`), no space.
- Emphasis inside a sentence is weight 600, never colour. A display line may overprint one word in pink only when it is
  the subject of the line and the line is the screen's riso moment (see §10); never in body or UI text.

## 4. Spacing, grid, radii, lines

- Base unit 4 px. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Component padding is 8/12/16; section rhythm is 24/32/48.
- App content column: max 768 px, gutter 24 px (16 px at 390). Reading column inside it: max 68 ch.
- Desk and sheet (the inset-card layout): the window is paper; the sheet is `--surface` inset 12 px top / right /
  bottom from the desk on ≥ 768 px, with a 1 px `--keyline` and `--shadow-raised` (4 px offset). At < 768 px the sheet
  is full-bleed with no keyline or shadow and a 56 px top bar.
- Radii: `--radius-control: 2px` on buttons, inputs, sheets, dialogs, popovers, avatars (avatars are square, like
  print portraits). Pills (`999px`) only on chips. No other radius exists.
- Hairlines: `--line` 1 px for dividers and table rules; `--keyline` 1 px for the edge of any plate; `--line-strong`
  for input borders at rest and registration crosses. Never two lines within 4 px of each other.
- 390 px rules: single column; sidebar becomes the drawer; page header actions collapse to one icon button plus an
  overflow menu; tables become stacked rows with caption labels; no element wider than the viewport
  (`document.documentElement.scrollWidth <= innerWidth` is a Playwright check); display sizes clamp per §3.2; touch
  targets ≥ 44 px even when the visual control is 32 px (use padding, not size).

## 5. Riso devices

Every device is CSS or inline SVG, animates transform/opacity only, and is `aria-hidden` when decorative.

### 5.1 Keyline and ink shadow (elevation)

```css
.plate { background: var(--surface); border: 1px solid var(--keyline); border-radius: var(--radius-control); }
.plate--raised  { box-shadow: var(--shadow-raised); }   /* 4px 4px 0 0 var(--plate-shadow) */
.plate--sm      { box-shadow: var(--shadow-sm); }       /* 2px 2px 0 0 */
.plate--overlay { box-shadow: var(--shadow-overlay); }  /* 6px 6px 0 0 */
```

Interactive plates (buttons, pressable rows) do not use `box-shadow`. The element itself is the **static plate** and a
child is the **moving face**, so the press animates with transform only and the plate never moves with the face (a
`::before` behind a translated element would both move and, inside the stacking context a transform creates, paint over
the face):

```html
<button class="press"><span class="press__face">Send</span></button>
```

```css
.press { position: relative; padding: 0 3px 3px 0; background: var(--plate-shadow); border: 0;
         border-radius: var(--radius-control); }
.press__face { display: inline-flex; translate: 0 0; background: var(--ink); color: var(--on-ink);
               border: 1px solid var(--keyline); border-radius: inherit; transition: translate 150ms var(--ease-ink); }
.press:active .press__face, .press[data-pressed] .press__face { translate: 3px 3px; }  /* face lands on the plate */
```

The button box includes the 3 px plate; the face is 3 px shorter and narrower than the box. Focus rings go on the
button (the plate), so they never move during the press.

### 5.2 Overprint

**Flat overprint (default).** Wherever the overlap can be drawn as its own shape (logo, chips, donut segments, empty
state illustrations at rest, icons) fill it with `var(--overprint)`. No blend mode: deterministic in both themes and
free to paint.

**Live overprint (moving or hovering plates, marketing).** The plan's token is the designed riso result, not the
arithmetic multiply (pure multiply of the two day inks gives `#2B1487`, which is never used). Solved opacities land the
live overlap on the token:

```css
.overprint { position: relative; isolation: isolate; }
.overprint .plate-blue { background: var(--blue); opacity: .70; }
.overprint .plate-pink { background: var(--pink); opacity: .84; mix-blend-mode: multiply; }   /* overlap ≈ #683299 */
:root[data-theme="dark"] .overprint .plate-blue { opacity: 1; }
:root[data-theme="dark"] .overprint .plate-pink { opacity: 1; mix-blend-mode: screen; }       /* overlap = #FFB5FF */
```

In live mode the plates read a touch lighter than flat ink (`#6876E5`, `#FE6AA8` by day), so live overprint is for
decoration at 48 px and larger, never for a UI fill.

### 5.3 Misregistration

`--misreg: 2px` in the app, `3px` for display ≥ 48 px. Only display-1 / display-2 text, the wordmark, empty-state
plates and primary-button hover may misregister. Text copies are real `aria-hidden` spans (not `::before` with
`attr()`, which leaks into accessible names):

```html
<h1 class="misreg" data-size="display-2">What are we writing today?
  <span aria-hidden="true" class="misreg__pink">What are we writing today?</span>
  <span aria-hidden="true" class="misreg__blue">What are we writing today?</span>
</h1>
```

```css
.misreg { position: relative; isolation: isolate; }
.misreg__pink, .misreg__blue { position: absolute; inset: 0; z-index: -1; pointer-events: none; mix-blend-mode: multiply; }
.misreg__pink { color: var(--pink); translate: calc(var(--misreg) * -1) calc(var(--misreg) * -.5); }
.misreg__blue { color: var(--blue); translate: var(--misreg) calc(var(--misreg) * .5); }
:root[data-theme="dark"] :is(.misreg__pink, .misreg__blue) { mix-blend-mode: screen; }
```

Settling animation (home, auth only): copies start at 3× `--misreg` and settle to 1× over 240 ms (P32).

### 5.4 Grain

One tile, rendered once, **beneath all content** (ruling U11): it is a background layer of the desk, blended into the
paper colour with `background-blend-mode`, so no text, input or button is ever painted under grain and presence never
depends on whether an element is positioned. The opaque sheet (`--surface`) covers it; the sidebar sits on it; the home
hero field is the only other grainy area and it is its own canvas.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <filter id="g">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 0 0 .5 1"/></feComponentTransfer>
  </filter>
  <rect width="128" height="128" filter="url(#g)"/>
</svg>
```

Strength is baked into the tile's alpha table: day `tableValues="0 0 0 0 0 .035 .07"` with `background-blend-mode:
multiply`, night `0 0 0 0 0 .045 .09` with `screen`. Applied as `body { background-image: var(--grain-tile);
background-color: var(--paper); background-blend-mode: var(--grain-blend); }` (the browser rasterises the tile once); if
the 60 fps check shows paint cost, swap for the pre-rendered 128 px PNG with identical values. No fixed overlay exists,
so nothing can sit under grain by accident. The animated version (three seeds 7 / 11 / 19 cycled at 8 fps) exists on
marketing and `/design` only and is static under reduced motion (P22).

### 5.5 Halftone skeleton (P25)

```css
.skeleton { position: relative; overflow: hidden; border-radius: var(--radius-control);
  background-color: var(--surface-sunk);
  background-image: radial-gradient(circle, var(--ink-faint) 1.1px, transparent 1.2px);
  background-size: 6px 6px; opacity: .55; }
.skeleton::after { content: ""; position: absolute; top: -20%; bottom: -20%; left: 0; width: 30%;
  background: var(--surface); opacity: .5; transform: skewX(-18deg) translateX(-140%);
  animation: skeleton-sweep 1.2s linear infinite; }
@keyframes skeleton-sweep { to { transform: skewX(-18deg) translateX(460%); } }
@media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none; display: none; } }
```

A hard-edged paper band, not a gradient shimmer. Lists over 20 rows use plain `--surface-sunk` bars.

### 5.6 Tinted stock and highlighter

Tinted stock is a background token, nothing more (`background: var(--stock-pink)`), used for the selected voice row,
"from your posts" callouts (pink) and "generated by Brandloop" notes (blue). The highlighter is an inline plate behind
ink text: `.hl { background: var(--highlight); box-decoration-break: clone; padding: 0 .12em; }`, drawn in by `scaleX`
from the left on reveal (P11). One highlighted phrase per screen at most.

### 5.7 Registration crosses (P26)

8 × 8 px cross, 1 px `--line-strong`, 12 px inset. In the app they mark the four corners of the **desk** (the window,
≥ 768 px), as on a drafting table, and they pair with the sheet's ruled margin (§9). Also on marketing frames and
empty-state plates. Never on data, never inside the sheet.

### 5.8 Dither, halftone and ASCII

| Use | Treatment | Implementation (one per use) | Runtime cost | Licence | Reduced motion |
|-----|-----------|------------------------------|--------------|---------|----------------|
| 9 preset voice avatars (Tamsin Ashworth, Callum Strand, Priya Lindqvist, Gideon Marsh, Odalys Brennan, Kaito Ferreira, Elias Thornquist, Nadine Okoro, Wren Castellano) | two-ink 4×4 Bayer field with the initial in Archivo 800 / 125; ink pair cycles pink-on-paper, blue-on-paper, overprint-on-paper by index | hand-built inline SVG with a `<pattern>` fill, colours from CSS vars so they re-theme | 0 JS, ≈ 1 KB each | ours | static |
| profile and uploaded avatars | 1-bit Atkinson diffusion pre-rendered on upload at 2×, served as black/transparent PNG and painted through `mask-image` in `--pink` (the person); fallback: initials on a pink plate | server-side `sharp` (resize, greyscale) + ≈ 30-line Atkinson pass in the upload action; `image-rendering: pixelated` | 0 client JS, 1–3 KB PNG | sharp Apache-2.0 | hover crossfade to the photo is opacity-only (P15), allowed |
| halftone skeleton loaders | CSS dot grid + hard sweep band (§5.5) | CSS | 0 | — | band hidden |
| empty-state illustrations | hand-drawn two-plate SVG with an explicit overprint path; 4×4 Bayer `<pattern>` for tints | SVG + Motion transform drift of 2 px (P23) | 0 deps | ours | no drift |
| knowledge-base thumbnails | 1-bit 4×4 ordered dither (halftone) of the first page/frame, generated on upload; painted through `mask-image` in `--pink`; hover/focus crossfades to the original (simplified P18, no canvas) | server-side `sharp` + hand-written Bayer threshold; text-heavy sources (PDF/DOC/diagrams) skip the dither and show a type plate | 0 client JS | sharp Apache-2.0 | static |
| marketing hero and `/design` hero art | Bayer dither field in the two inks behind the live composer demo | `@paper-design/shaders-react` (`Dithering`, exact version pinned) on one shared canvas via `next/dynamic` `ssr:false`, dpr ≤ 1.5, pre-rendered poster PNG as fallback and LCP image. Adopt only if it costs ≤ 60 KB gz on the marketing route and is never imported by app routes; otherwise hand-written raw WebGL Bayer (Codrops guide, ≈ 3 KB) | marketing route only | Apache-2.0 | poster PNG |
| `/design` loader demo | ASCII render, Canvas 2D, 96 px cells, 15 fps | hand-built ≈ 2 KB, dev page only; ASCII is not used in the product or marketing (it reads "terminal") | dev only | ours | one frame |

Forbidden for all three treatments: body and composer text, dense tables and data, charts, forms and inputs, anything
under 12 px, error and destructive states, anything a person must read quickly. Every decorative layer is
`aria-hidden`, `pointer-events: none`; meaningful images keep `alt`.

## 6. Elevation and state rules

Three elevations only: **flat** (no shadow; rows, sections), **raised** (keyline + 4 px plate; buttons, sheets that
open, popovers use 2 px), **overlay** (keyline + 6 px plate; dialogs, command palette, with a scrim of `--ink` at 40 %
and no backdrop blur). Nothing lifts on hover; hover moves a plate or inverts.

| Primitive | Rest | Hover | Focus-visible | Active / pressed | Disabled | Selected / current |
|-----------|------|-------|---------------|------------------|----------|--------------------|
| Button primary (ink) | ink face, on-ink text, keyline, plate 4 px | pink and blue plates misregister 2 px behind the face (P02) | focus ring + paper halo | face translates onto the plate (P01) | face `--surface-sunk`, text `--ink-faint`, keyline `--line-strong`, no plate | — |
| Button generate (blue) | blue face, on-blue text | same as primary | same | same | same | — |
| Button secondary | surface face, keyline, no plate | ink soaks in from the entry side, text flips to on-ink (P03) | focus ring | 1 px translate | keyline `--line-strong`, text faint | — |
| Button ghost | no keyline, muted text | `--surface-sunk` fill, ink text | focus ring | sunk + 1 px translate | faint text | — |
| Button danger | danger face, on-danger text | plates in danger and ink | focus ring | press | as primary | — |
| IconButton | as ghost (or primary when the only action, e.g. Send) | sunk fill | focus ring | stamp: rotate 6°, scale .94 (P08) | faint | — |
| Input / Textarea / Select | surface, 1 px `--line-strong` border, ink text, faint placeholder | border `--keyline` | border `--focus` 1 px + ring 2 px `--focus` at 35 % | — | sunk fill, faint text, `--line` border | invalid: border `--danger` + caption error |
| Chip (pill) | ink text, keyline, surface, two 1 px offset plates behind it (pink front-left, blue back-right) | the two plates swap places by transform, text stays ink (P14) | focus ring | press 1 px | faint | pink plate, on-pink text, overprint 1 px ring when "in use" |
| Nav row | muted text, icon 1.75 | ink-bar sweep: ink fill scales in from the left, paper text (P10) | ink bar + focus ring | — | — | current: ink bar held; `aria-current="page"` |
| List row / memory line | ink text, hairline below | plate slides in 2 px from the bottom-right (P12), no lift | same as hover + ring | pressed 1 px | — | pink source tab held, `--stock-pink` background |
| Sheet (card) | surface, keyline, flat | if clickable: plate slide (P12); else none | ring on the whole sheet | — | — | overprint keyline |
| Tab | muted text | ink text | ring | — | — | ink underline plate slides via `layoutId` (P29) |
| Menu / command item | ink text | ink bar, paper text (`data-highlighted` / `data-selected`) | same | — | faint | check in overprint |
| Avatar | dithered pink plate | dots grow to the photo (opacity crossfade) | ring | — | — | overprint 2 px ring |
| Link | blue, no underline | SVG underline draws (P13) | ring + underline shown | — | — | visited: unchanged |
| Toggle (theme radio) | ghost | sunk | ring | — | — | pink plate, on-pink icon |

Focus ring everywhere: `outline: 2px solid var(--focus); outline-offset: 2px`; on ink/blue/pink plates add
`box-shadow: 0 0 0 2px var(--paper)` so the ring clears 3:1. `:focus` without `-visible` shows nothing.

## 7. Iconography

Lucide only. Sizes 16 px in rows, buttons and inputs (stroke 1.75); 14 px inside chips and captions (stroke 2);
20 px in page headers and empty states (stroke 1.5); 24 px nowhere in the app (marketing only). Current nav item icon
stroke 2.25. Icons inherit `currentColor`; the only coloured icons are the overprint check and the pink "in use" dot.
No sparkle, wand or star icons for AI actions; generation uses the `PenLine` family and the blue ink says the rest.

## 8. Component inventory (`packages/ui`)

| Component | Anatomy | Variants | Sizes | Tokens | Motion hook | Source plan |
|-----------|---------|----------|-------|--------|-------------|-------------|
| Button | face, label, optional icon, shadow plate (`::before`), misreg plates (`::after` ×2 on primary) | primary, generate, secondary, ghost, danger | sm 32, md 36, lg 44 | ink/blue/surface, on-*, keyline, plate-shadow | ink press, soak, async morph | adapt Originkit `tactile-button` + `radial-reveal-button` |
| IconButton | square face, icon, sr-only label | ghost, primary | 32, 36, 44 touch | as Button | stamp | hand-built (Button variant) |
| Input, Textarea, Select, Label, Hint, FieldError | control, label, hint, error caption | default, invalid | h 36 (sm 32) | surface, line-strong, keyline, focus, danger | none (border swap) | hand-built (existing `field.tsx`) |
| Dialog | scrim, plate, title (title-2), body, footer | default, destructive (AlertDialog) | sm 420, md 560 | surface, keyline, shadow-overlay, ink 40 % scrim | stamp in, exit fade | radix Dialog + Motion; idea from Motion Primitives `morphing-dialog` for sheet-opens-from-card |
| Popover, DropdownMenu, Tooltip | plate 2 px, items, separator | menu, popover, tooltip | w 256 menu | surface, keyline, shadow-sm | stamp 120 ms | radix + Motion, hand-built |
| Tabs | list, trigger, underline plate | underline | h 36 | ink, line | `layoutId` underline | Animate UI Tabs (reference) → hand-built |
| Chip | pill, label, optional icon/count | default, pink (selected), blue (AI), count | h 24 / 28 | keyline, pink, blue, on-* | plate swap | hand-built |
| Badge | square label | ink, pink, blue, overprint, danger | h 20 | plates | none | hand-built |
| Sheet | surface plate with keyline, optional header | flat, raised, clickable | — | surface, keyline, plate-shadow | plate slide on hover (clickable) | hand-built |
| Skeleton | halftone block | text, block, avatar | any | surface-sunk, ink-faint | CSS sweep | hand-built (§5.5) |
| EmptyState | two-plate SVG, display-2 line, body, one action | default, placeholder ("on the way") | — | pink, blue, overprint | plate drift | hand-built SVGs |
| Grain | fixed overlay | static, animated (marketing) | — | ink | opacity seed cycle | hand-built (§5.4) |
| Overprint | two plates + optional overlap path | flat, live | — | pink, blue, overprint | misreg settle | hand-built (§5.2) |
| Avatar | square, dither mask or initials plate, ring | sm 24, md 32, lg 48, xl 64 | — | pink, overprint, surface | halftone grow | hand-built (§5.8) |
| Kbd | keycap plate with 2 px shadow | — | h 20 | surface-sunk, keyline | keycap press (P09) | hand-built |
| Toast (Sonner theme) | plate, icon (overprint tick / danger), title, description | success, error, info | w 356 | surface, keyline, shadow-raised | stamp in (P24) | Sonner + theme |
| Donut | SVG ring, segments, 2 px paper gaps, legend | — | 160 / 200 | pink, blue, overprint, ink, muted | draw in | hand-built (existing `content-mix.tsx`) |
| Meter | SVG bar with ink keyline, fill plate | — | h 8 | as Donut | draw in | hand-built |
| Link | anchor + SVG underline | inline, standalone | — | blue | underline draw | hand-built (P13) |
| SmoothScroll | Lenis provider | root, wrapper | — | — | Lenis + Motion frame | `lenis/react` |
| KineticHeading | `h1` with `aria-label`, letter spans (`aria-hidden`), pink and blue plate copies | hero, title | display-1 / hero | ink, pink, blue | letters set in, widths 75 → 125, plates chase into register | hand-built (Motion Primitives `text-effect`, Originkit `text-colour-sweep` as ideas) |
| DitherField | Canvas 2D two-ink Bayer field | hero | — | pink, blue, overprint | drift, pointer reaction, lazy, paused off-screen | hand-built (Originkit `dither-burn`, `bayer-vortex` as ideas) |
| Ticket | rectangular stamped chip with a perforated edge and two offset plates | default, selected | h 32 | keyline, pink, blue | stamp in (C6), plate swap on hover | hand-built (Originkit `wax-seal` as the stamp idea) |
| Reveal | `whileInView` wrapper | fade-print, stagger | — | — | scroll-driven reveal (C8) | hand-built on Motion `whileInView` |
| Hairline / Divider | 1 px rule | line, keyline | — | line, keyline | none | hand-built |
| Highlight | inline plate | — | — | highlight | scaleX reveal | adapt Originkit `text-colour-sweep` idea |

## 9. Shell layout

| Region | Spec |
|--------|------|
| Desk | `--paper` with grain beneath everything (§5.4); registration crosses at its four corners (§5.7); holds the printed index and the sheet |
| Sidebar, the printed index (248 px) | brand row (logo mark 24 + wordmark in Archivo 600 / 100 at 19 px), search icon button, collapse button; `nav[aria-label="Main"]` rows h 36 with kinetic hover (C7: ink bar sweeps in from the left, the label rolls up and its duplicate rolls in); "Chats" section; profile menu on a top hairline. At the foot, the **index label**: the current (or hovered) page name set in Archivo 800 / 125 at 88 px in `--ghost`, clipped by the sidebar edge like a running head, swapping by a vertical roll. No keyline between sidebar and desk; the sheet's keyline is the edge |
| Rail (56 px) | mark, search, five icon rows (sr-only labels), expand, profile; current row = ink bar 32 × 32 |
| Section panel (228 px) | title-2 header (section title), groups with caption labels, rows as sidebar; vertical `--line` hairline on its right edge |
| Sheet, the drafting table | `--surface`, keyline, `--shadow-raised`, radius 2, inset 12 px; a **ruled margin** 24 px from its left edge (1 px `--line`) with ticks every 32 px (`--line-strong`, 4 px, every fourth 8 px); the Lenis wrapper scrolls inside it (`micro-interactions.md` §6); `scrollbar-gutter: stable`; ruler hidden < 768 px |
| Page header | h 56, sticky, `--surface` opaque (no backdrop blur), bottom hairline; title-2 title preceded by a 1 px × 20 px `--keyline` vertical rule (bleibtgleich meta pattern); actions right; 390: title truncates, actions collapse |
| Command palette | overlay plate 560 max, input h 48 with search icon, groups with caption headings, items h 36 with ink-bar highlight, kbd hints on the right, `data-lenis-prevent` on the list; placeholder "Search pages and profiles…" unchanged |
| Profile menu | plate 256 with team name caption, profile rows with avatars, "Add profile", separator, "Settings", theme radiogroup as three chips (aria-labels Light / Dark / System), separator, "Sign out" in danger |
| Mobile drawer | `min(300px, 86vw)`, paper, keyline right edge, slides in by transform; same sidebar/section content; close button top-right |
| Route transition | **No page transitions: routes switch instantly (user decision 2026-10-21).** After a route change focus moves to the page's `h1` (or `main`), with no animation |
| Cursor | the native cursor everywhere (a custom drafting cursor was built and removed on the user's decision, 2026-10-21) |
| Smooth scroll | Lenis in wrapper mode inside the sheet, driven from Motion's frame loop; native under reduced motion (§6 of `micro-interactions.md`) |
| Auth | paper desk, centred wordmark display-1 with 3 px misregistration, Clerk card as an overlay plate; Clerk `appearance.variables`: `colorPrimary` ink, `colorForeground` ink (the installed `Variables` type has no `colorText`), `colorBackground` surface, `borderRadius: "2px"`, `fontFamily: var(--font-ui)`, `fontFamilyMono: var(--font-ui)` |

## 10. Cinematic direction

The restrained "one moment per screen" rule is withdrawn (user decision after Task 1). Every screen has a composition and
a motion score. What we take from the four references, as lessons only: **FORMAT by Obys**, the scale jump (one gigantic
display line clipped by the grid against caption-sized text) and type that rises into place from a clipped edge behind a
curtain wipe; **Signal-A Studio**, emphasis by width and weight inside one block, nav on hairline rules, labels that move
on hover; **Heron AI**, the drafting instrument (grain, registration crosses, ruler ticks, a cursor with a coordinate
readout, spot colour at pin-point scale, a drawing that draws itself); **Ascension by Pegassi**, the entry gate where the
first interaction is an object that lands, with grain carrying the mood. All four run Lenis at lerp ≈ .1 and settle a
wheel tick in about a second; their one-shots run 600–1500 ms; their feedback is instant.

Rules for every score: one-shots 600–1200 ms, feedback ≤ 200 ms and never blocking input; `prefers-reduced-motion`
renders the final frame of every sequence (no Lenis smoothing, no animated canvas); heavy effects load after first
paint and pause off-screen; budgets in `micro-interactions.md` §8. No custom cursor and no page transitions (user
decisions, 2026-10-21).

### 10.1 Shell: the print room

Composition: the window is the desk (paper, grain beneath, registration crosses at the corners). Left, the **printed
index**: brand row, nav rows on the paper, the "Chats" running list, and at the foot the current page's name set huge in
Archivo 125 and clipped by the sidebar edge (FORMAT's clipped wordmark). Right, the **drafting table**: the sheet with
its keyline, 4 px plate, a ruled margin with coordinate ticks, and the page printed on it.

| t (ms) | Score |
|-------:|-------|
| nav hover 0–200 | ink bar `scaleX 0 → 1` from the left; the label rolls up 100 % while its `aria-hidden` duplicate rolls in from below (Signal-A); text flips to `--on-ink` at 40 %; the index label at the foot swaps to the hovered name by a 260 ms vertical roll; leave 120 ms `ease-exit` |
| route change | No page transitions: routes switch instantly (user decision 2026-10-21). Focus moves to the new `h1` (or `main`) with no visible ring on the heading |
| collapse / expand 0–240 | sidebar width tweens (`ease-ink`); rail icons and labels crossfade; the index label clips out |
| drawer (< 768) 0–260 | `translateX -100% → 0` on the paper drawer (`ease-ink`), scrim opacity; close 180 ms `ease-exit` |
| command palette 0–180 | overlay plate stamps in (`scale .96 → 1`, opacity), rows invert to an ink bar on selection, keycap hints |

Reduced motion: every row is its final frame.

### 10.2 Home: the press

Composition: the greeting is **kinetic display type at hero scale** (Archivo 800, width 125, `clamp(40px, 6.4vw, 88px)`,
two lines, left-aligned with the composer column), a caption-sized "Good afternoon, Ahmed" above it. The composer is a
**printed object**: surface face, keyline, 6 px ink plate, that lands on the table. Behind the headline and the
composer lies the **dithered two-ink field**: a 3 px Bayer screen of pink and blue drifting slowly, overprinting to
purple where they cross, densest around the composer and dissolving (by dot density, never by gradient) toward the
headline, reacting to the cursor by pulling the two inks a few pixels out of register around it. Below, five
**stamped tickets** (rectangular, keyline, perforated left edge, 2 px pink and blue plates behind). Send is the only
blue plate on the page and a **tactile press**.

| t (ms) | Score |
|-------:|-------|
| 0 | the page is there (no page transitions) |
| 160–1060 | the greeting sets in: each letter `opacity 0 → 1`, `translateY .18em → 0`, `font-stretch 75% → 125%`, 420 ms `ease-ink`, 22 ms stagger; the pink copy runs the same score 70 ms behind and the blue copy 140 ms behind, each ending 3 px out of register (the plates chase into register) |
| 520–1000 | the composer lands: `opacity 0 → 1`, `translateY -28px → 0`, `rotate -1.2deg → 0`, `scale 1.02 → 1` on a spring (stiffness 320, damping 26); its ink plate starts flush and slides out to 6 px / 6 px 120 ms later (the sheet settles, the shadow catches up) |
| 820–1140 | the tickets stamp in: `scale 1.12 → 1`, `rotate -2deg → 0`, opacity, 180 ms `ease-ink`, 60 ms stagger |
| ≥ 900 | the dither field fades in (opacity, 600 ms) once its chunk has loaded after first paint |
| feedback | ticket hover: the two plates swap sides (180 ms) and the label rolls; Send press: face onto plate (spring-press); Send hover: pink and blue plates misregister 2 px; composer focus: keyline → `--focus` |

Reduced motion: letters at width 125 and copies at 3 px from the first frame, composer and tickets in place, the field is
a static CSS Bayer tile. The score plays on every mount of home; it finishes under 1.2 s and the composer is usable from
the first frame.

### 10.3 Other screens

Until their own cinematic tasks land, screens switch in instantly, their content below the fold
reveals on scroll (C8: `opacity 0 → 1`, `translateY 12px → 0`, 420 ms, 40 ms stagger, once), and they keep these
anchors for later: **Memories**, source tabs per line (pink yours, blue extracted, overprint mirrored) and two-plate
empty state; **Strategy**, the donut draws its overprinted segments while percentages tick; **Voice picker**, Bayer
monogram portraits with the overprint ring on the one in use; **Settings**, "Save changes" morphs label → halftone →
tick; **Auth**, the mark draws itself, the wordmark lands misregistered; **Placeholders**, a registration-cross frame
holding a two-plate illustration that drifts on hover; **Command palette**, rows invert to an ink bar with keycap hints.

## 11. Slop checklist

Verbatim from the plan (every item is a hard fail in review):

- cream with a serif and a terracotta accent
- near-black with a single acid accent
- identical rounded cards with soft grey shadows and gradient washes
- all-caps eyebrows
- `A · B · C` metadata strings
- "→" on button text
- accenting a single word in a headline
- mono-font data labels
- fade-and-slide-up on every section

Extended for this system (also hard fails):

- any gradient, blur, glow, glassmorphism or aurora; `backdrop-filter` anywhere
- sparkle / star / wand icons or "magic" copy for generation; floating orbs; gradient text
- numbered `01 / 02 / 03` markers on content that is not a sequence
- `WORD — fragment` labels; tinted near-black (`#0B0B0B`, `#111`) standing in for ink; `#FFFFFF` used as paper
- pink and ink without the second ink and grain (that is Gumroad); Kleo's layout or palette
- square corners used as "broadsheet" styling with dense newspaper columns and no plate device on the screen
- three identical feature cards with icon-in-circle; logo wall; dashboard hero with fake charts and avatar bubbles
- dither, ASCII or grain over body text or dense data; a mono face used for "terminal" flavour
- endless float, bounce or pulse; parallax on everything; scroll-jacking without reduced motion
- stock 3D renders, bokeh or particle fields; fake testimonials with stock faces
- placeholder copy ("Lorem ipsum", "Your title here"), copy that sells instead of explains, errors that apologise

## 12. Load-bearing copy (feature-parity gate)

Strings asserted by `apps/web/e2e/*.spec.ts` through accessible names. Keep them byte-for-byte; a change requires
updating the spec in the same commit with a recorded reason.

| Spec | Role / kind | String |
|------|-------------|--------|
| shell | heading | `What are we writing today?` |
| shell | navigation name + link | `Main` → link `Posts` |
| shell | button | `Profile menu` (also must contain the current profile name) |
| shell | menuitem | `Add profile` |
| shell | label / button | `Profile name` / `Add profile` |
| shell | toast | `Switched to {name}` |
| shell | label / button / toast | `Timezone` (select) / `Save changes` / `Settings saved` |
| shell | button / button / toast | `Delete {name}` / `Delete profile` / `Deleted {name}` |
| shell | placeholder | `Search pages and profiles…` (Ctrl+K opens it; Enter navigates) |
| shell | navigation name | `Ideas` (section panel nav on `/templates`) |
| memories | button | `Add a memory` (empty state and Identity card) |
| memories | label / button / toast | `New memory` / `Add memory` / `Memory added` |
| memories | button | `Edit: {text}`, `Delete: {text}` |
| memories | label / toast | `Edit memory` (Enter saves) / `Memory updated` |
| memories | button / toast | `Delete memory` / `Memory deleted` |
| memories | button / button / testid | `Import memories` / `How to get your memories` / `import-prompt` containing `List everything you know about me` |
| memories | button | `Cancel` |
| strategy | headings | `Strategy foundation`, `Content mix`, `Audience balance`, `Formats and cadence`, `Recurring series` |
| strategy | testids | `mix-percent` (5 inputs summing to 100), `mix-row` (hover adds class `bg-surface-sunk`: keep that class on the highlighted legend row) |
| strategy | group | `Content mix chart` (SVG role group) |
| strategy | button / label | `Edit tagline` / `tagline` (exact) |
| strategy | label / toast | `Educational percent` / `Strategy saved` |
| strategy | button / alertdialog text | `Regenerate strategy` / `A new strategy will replace the current one, including your edits.` |
| voice | button / combobox | `Change writing style` / `Search writing styles` |
| voice | options | `Odalys Brennan`, `Callum Strand`, `Add your style` (all nine preset names stay) |
| voice | toast / group | `Writing style: {name}` / `Selected writing style` |
| voice | label / button / alert | `Your posts` / `Learn my style` / `Paste at least 3 posts of 200+ characters` |

Also keep (used by the shell and screens, not yet in specs): `Open navigation`, `Close navigation`, `Search (Ctrl K)`,
`Collapse sidebar`, `Expand sidebar`, `Brandloop home`, `Theme` + `Light` / `Dark` / `System`, `Sign out`,
`Nothing matches that search.`, `Nothing here yet.`, `No strategy yet`, `Replace your strategy?` / `Replace strategy`,
`Delete this memory?`, `Strategy ready`, `Memories imported`, `Prompt copied`, `Your writing style is ready`,
page titles `Posts`, `Memories`, `Manage account`, `Manage team`, `Strategy`, and the nav labels in `src/lib/nav.ts`.

## 13. Decisions and deviations

- Overprint: the plan's `#6B2C9E` is kept as the flat token; the live blend uses solved opacities (§5.2) because the
  pure multiply of the inks is `#2B1487`.
- Night overprint is `#FFB5FF` (screen of the night inks) rather than a darkened purple, so the device and the token
  agree in both themes.
- `--ink-faint` is darker than the current token so placeholders pass AA on sunk fields; `--danger` is re-hued to a
  printed red.
- Avatars become square. Preset avatars are generated two-ink monograms, since presets are fictional and carry no photo.
- Registration crosses mark the desk corners in the app (cinematic direction, Task R2★); never inside the sheet or on data.
- The home starter chips are rectangular stamped tickets, not pills (cinematic direction); filter and theme chips stay pills.
- No page transitions: routes switch instantly (user decision 2026-10-21). The `template.tsx` + `AnimatePresence` route stamp from the restrained plan is dropped too.
- Grain is a background layer of the desk (U11), not a fixed overlay.
- Tabular numerals: Hanken has no `tnum` feature but its figures are already equal-width; declared anyway.
