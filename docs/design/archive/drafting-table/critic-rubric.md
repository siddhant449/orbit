> Superseded by docs/design/orbit/ on 2026-10-22.

# Design-critic rubric (Drafting table)

Version 2, 2026-10-21. Applied to every screen before its task is accepted. The reference documents are
`system.md` (system), `micro-interactions.md` (motion) and the plan's non-negotiables. Supersedes the Riso Print rubric.

## Procedure

1. Capture set per screen: 1440 × 900 and 390 × 844, day and night, full page, saved to
   `.superpowers/sdd/<plan>/shots/drafting-<screen>-<viewport>-<theme>.png`. For a screen with a motion moment add a
   frame strip of the moment and one still with `prefers-reduced-motion: reduce`.
2. Also run: `@axe-core/playwright` (serious / critical), the horizontal-scroll check at 390, the reduced-motion check,
   the screen's e2e spec.
3. Walk every row. Each is pass or fail; cite the evidence named in the row.
4. Any fail in A (system), C (accessibility) or D (copy parity) blocks the task. Fails in B (slop) and E (motion) are
   listed with concrete fixes and block when there are two or more.
5. Output: a short table of fails with the fix, then a one-paragraph verdict. No praise sections.

## A. System conformance

| ID | Check | Pass when | Evidence |
|----|-------|-----------|----------|
| A1 | Palette only | every colour is a token from `system.md` §2 (day or night); no ad-hoc hex; no tinted greys beyond `--ghost`, the grid line and the scrim | computed colours of 5 sampled elements |
| A2 | Signal is status | `--signal` / `--signal-ink` / `--signal-soft` appear only for errors, destructive actions and live or active indicators; never as decoration, brand accent or hover colour | list each signal element and its status meaning |
| A3 | Graphite actions | primary actions are graphite plates with paper text; links and focus are graphite; nothing is coloured to look "primary" | crop of the primary button and a link |
| A4 | Night is specified | night shots use the night tokens (paper `#15161A`, ink `#E8E6E1`, lines `#34363C`, keyline `#B9B7B1`); signal keeps its status rule | computed styles in night mode |
| A5 | Type families | only Archivo (display, `font-stretch` ≤ 100 %) and Hanken Grotesk; no monospace anywhere, including kbd hints and numbers | rendered fonts on 5 elements incl. a kbd and a number |
| A6 | Type scale | every size is a step from §3.2; nothing between 20 and 28 px except title-1; nothing under 11 px; display never under 18 px | computed `font-size` list |
| A7 | Measure | reading text ≤ 68 ch, UI rows ≤ 56 ch, captions ≤ 44 ch at 1440 | widest paragraph in ch |
| A8 | Numerals | captions, inputs, legends and counters use tabular numerals; number columns align | crop of a number column |
| A9 | Radii | 2 px on controls, sheets, dialogs, avatars; pills only on chips; nothing else | `border-radius` on 6 elements |
| A10 | Elevation | hairline borders only, plus at most a 1 px graphite offset on raised and overlay plates; no blurred shadow, no `backdrop-filter`; nothing lifts on hover | search computed styles for `blur(`; hover crop |
| A11 | Lines | dividers and grids in `--line`, perceivable boundaries in `--line-strong`, plate edges in `--keyline`; no two lines within 4 px | crop of a form and a list |
| A12 | Drafting marks | crosshair marks sit at the desk corners and frame figures; dimension lines carry end ticks and a measured label; the ruler ticks every 32 px; none of them sit on data | crops |
| A13 | Line art | empty states and the hero use monochrome ink line drawings in `currentColor`, drawn with stroke animation; no illustrations in colour, no 3D, no photos as decoration | crop + frame strip |
| A14 | Quiet elsewhere | everything else is hairlines, graphite and text | full-page shot |
| A15 | Shell spec | sidebar / rail / section panel / header / palette / drawer match §9 (widths, header rule, opaque sticky header, no blur scrim, no page transition) | measured widths; header crop |
| A16 | Monograms | avatars are graphite line monograms (hairline frame, ink initials) or photos; no coloured plates, no dither | crop |
| A17 | Icons | lucide, sizes and strokes per §7; no sparkle / wand / star for AI | icon list |
| A18 | Display face renders | Archivo at ≤ 100 % width with tight tracking at display-1/2, not clipping at 390 | 390 crop of the largest heading |
| A19 | Primitives only | buttons, fields, dialogs, menus and sheets come from `@brandloop/ui`; no one-off re-implementations | import list |

## B. Slop checklist (each is a fail when present)

| ID | Check |
|----|-------|
| B1 | cream background with a serif and a terracotta / warm-clay accent |
| B2 | near-black with a single acid accent |
| B3 | identical rounded cards with soft grey shadows and gradient washes |
| B4 | all-caps eyebrows or tracked-out all-caps labels |
| B5 | `A · B · C` metadata strings joined with middle dots |
| B6 | "→" appended to button or link text |
| B7 | a single accented word in a headline |
| B8 | monospace data labels |
| B9 | fade-and-slide-up entrance on every section or card |
| B10 | any gradient, blur, glow, glassmorphism, aurora, `backdrop-filter` |
| B11 | sparkle / star / wand icons, "magic" copy, gradient text, floating orbs |
| B12 | `01 / 02 / 03` markers on non-sequential content; `WORD — fragment` labels |
| B13 | tinted near-black (`#0B0B0B`, `#111`) or `#FFFFFF` used as ink or paper |
| B14 | **riso devices**: misregistered colour plates or text copies, overprint shapes, dither / halftone / ASCII fields, grain overlays, coloured offset shadows, two-ink chips |
| B15 | **custom cursors** of any kind (crosshairs, dots, labels, coordinate readouts); the native cursor is the cursor |
| B16 | **page transitions** of any kind (view transitions, keyed `AnimatePresence`, curtains, wipes); routes switch instantly |
| B17 | signal red used as decoration, hover colour or brand accent |
| B18 | three identical feature cards / logo wall / fake-dashboard hero / stock faces / 3D renders / particles |
| B19 | endless float, bounce or pulse; parallax everywhere; scroll-jacking |
| B20 | placeholder or selling copy; apologising or vague errors; inconsistent verbs across a flow |

## C. Accessibility

| ID | Check | Pass when | Evidence |
|----|-------|-----------|----------|
| C1 | Text contrast | every text/background pair ≥ 4.5:1 (≥ 3:1 for ≥ 24 px or ≥ 19 px bold), both themes, incl. placeholders, signal text and text on graphite | axe + the two weakest ratios |
| C2 | Non-text contrast | input borders (`--line-strong`), focus rings, icon-only controls and meaningful graphics ≥ 3:1 | ratios |
| C3 | Status not by colour alone | signal meaning is doubled by a label, icon or position | crop with the second cue |
| C4 | Focus visible | every interactive element shows the 2 px graphite ring (paper halo on graphite plates) on Tab; no ring on mouse focus | 3 crops |
| C5 | Keyboard path | the full flow completes with keyboard only; Esc closes, Enter activates, arrows in lists/menus, Ctrl/⌘+K and ⌘+B work | step list |
| C6 | Reduced motion | with `reducedMotion: 'reduce'` nothing translates, scales or draws; Lenis smoothing off | test name + still |
| C7 | 390 px | no horizontal scroll, no text under 11 px, touch targets ≥ 44 px, drawer works | 390 shot + assertion |
| C8 | Axe | no serious or critical violations | axe summary |
| C9 | Names and roles | accessible names unchanged (section D), decorative SVG and marks `aria-hidden`, loaders `role="status"`, toasts announced | tree excerpt |

## D. Copy parity

| ID | Check |
|----|-------|
| D1 | every string in `system.md` §12 is present byte for byte in its role (the two documented name suffixes allowed) |
| D2 | verbs stay the same through a flow (button → toast) |
| D3 | empty states say what to do; errors say what happened and how to fix it |

## E. Motion

| ID | Check |
|----|-------|
| E1 | one-shots 600–1200 ms, feedback ≤ 200 ms, nothing blocks input |
| E2 | only transform, opacity, stroke-dashoffset and the greeting's weight / tracking animate |
| E3 | lines, grids, meters and rules draw in from an origin; panels slide on their rail; values count up; the greeting sets in by weight and tracking |
| E4 | no page transition, no custom cursor, no looping decoration |
| E5 | home eager JS ≤ +90 KB gzip over the baseline; lazy chunks recorded |
