# Design-critic rubric (Riso Print)

Version 1, 2026-10-21 (D1.2). Applied by the design-critic reviewer to every redesigned screen before its task is
accepted. The reference documents are `riso-system.md` (system), `micro-interactions.md` (motion) and the plan's
non-negotiables.

## Procedure

1. Capture set per screen: 1440 × 900 and 390 × 844, day and night print, full page, saved to
   `.superpowers/sdd/<plan>/shots/<screen>-<viewport>-<theme>.png`. For screens with a motion moment add a 1-second
   frame strip or GIF of the moment and one still with `prefers-reduced-motion: reduce`.
2. Also run on the screen: `@axe-core/playwright` (serious/critical), the horizontal-scroll check at 390, the
   reduced-motion check, the screen's e2e spec.
3. Walk every row below. Each is pass or fail; cite the evidence named in the row (a crop, a computed style, a test
   name, a ratio). "Not applicable" is allowed only where the row says so.
4. Scoring: any fail in sections A (system), C (accessibility) or D (copy parity) blocks the task. Fails in B (slop)
   and E (motion) are listed with concrete fixes and block when there are two or more.
5. Output: a short table of fails with the fix, then a one-paragraph verdict. No praise sections.

## A. System conformance

| ID | Check | Pass when | Evidence |
|----|-------|-----------|----------|
| A1 | Palette only | every colour on screen is a token from `riso-system.md` §2 (day or night set); no ad-hoc hex, no opacity-tinted greys beyond `--ghost` and the scrim | DevTools computed colours of 5 sampled elements (bg, text, border, icon, plate) |
| A2 | Ink meaning | pink appears only for the person (selection, profile, memories, highlighter); blue only for AI/system actions, links and focus; overprint only where the two meet; no other use | list each coloured element and its role |
| A3 | Text never in pink | no pink text under 48 px; no paper text on pink; no ink text on blue or overprint | crop of each coloured plate with its text |
| A4 | Night print is specified | night shots use the night tokens (surface `#19191F` above the desk, keyline `#B9B8C0`, dark text on every coloured plate, overprint `#FFB5FF`) | computed styles in night mode |
| A5 | Type families | only Archivo (display, `font-stretch` 100–125 %) and Hanken Grotesk; no monospace anywhere, including kbd hints, chips and numbers | DevTools "Rendered fonts" on 5 elements incl. a kbd and a number |
| A6 | Type scale | every text size is a step from §3.2; nothing between 20 and 28 px except title-1; nothing under 11 px; display face never under 18 px | computed `font-size` list |
| A7 | Measure | reading text ≤ 68 ch, UI rows ≤ 56 ch, captions ≤ 44 ch at 1440 | widest paragraph measured in ch |
| A8 | Numerals | captions, inputs, legends and counters use `font-variant-numeric: tabular-nums`; aligned columns of numbers line up | crop of a number column |
| A9 | Radii | 2 px on controls, sheets, dialogs, avatars; pills only on chips; no other radius | computed `border-radius` on 6 elements |
| A10 | Elevation | no blurred shadow, no `backdrop-filter`; raised = keyline + 4 px plate, overlay = keyline + 6 px plate, flat elsewhere; nothing lifts on hover | search computed styles for `blur(`; hover crop |
| A11 | Lines | dividers in `--line`, plate edges in `--keyline`, input borders in `--line-strong`; no two lines within 4 px | crop of a form and a list |
| A12 | Grain at rest | grain is visible on the desk and sheet in both themes, not over inputs, tables or dialog bodies | 200 % crop of the desk and of an input |
| A13 | Riso moment | exactly one moment from §10 is present and it is the one allotted to this screen; nothing else draws attention | name the moment and the frame strip |
| A14 | Quiet elsewhere | all other elements are flat plates, rules and text | full-page shot |
| A15 | Shell spec | sidebar / rail / section panel / page header / palette / drawer match §9 (widths, header rule, opaque sticky header, no blur scrim) | measured widths; header crop |
| A16 | Dither discipline | dither / halftone / ASCII only on avatars, skeletons, empty states, thumbnails, marketing hero; never on text or data; two inks, one pattern scale per surface | crop of each dithered element |
| A17 | Icons | lucide, sizes and strokes per §7; no sparkle / wand / star for AI | icon list |
| A18 | Display face renders | Archivo at 125 % width shows true extended forms at display-1/2 and does not clip or overflow at 390 (clamped sizes) | 390 crop of the largest heading |
| A19 | Primitives only | the screen uses `@brandloop/ui` components for buttons, fields, chips, dialogs, menus, sheets; no one-off re-implementations | component tree / import list |

## B. Slop checklist (from `riso-system.md` §11; each is a fail when present)

| ID | Check |
|----|-------|
| B1 | cream background with a serif and a terracotta / warm-clay accent |
| B2 | near-black with a single acid accent (night print must show both inks and the overprint) |
| B3 | identical rounded cards with soft grey shadows and gradient washes |
| B4 | all-caps eyebrows or tracked-out all-caps labels |
| B5 | `A · B · C` metadata strings joined with middle dots |
| B6 | "→" appended to button or link text |
| B7 | a single accented word in a headline (outside the allotted overprint word of a riso moment) |
| B8 | monospace data labels |
| B9 | fade-and-slide-up entrance on every section or card |
| B10 | any gradient, blur, glow, glassmorphism, aurora, `backdrop-filter` |
| B11 | sparkle / star / wand icons, "magic" copy, gradient text, floating orbs |
| B12 | `01 / 02 / 03` markers on non-sequential content; `WORD — fragment` labels |
| B13 | tinted near-black (`#0B0B0B`, `#111`) or `#FFFFFF` used as ink or paper |
| B14 | pink + ink without blue and grain (Gumroad); any Kleo layout or palette echo |
| B15 | square corners with dense broadsheet columns and no plate device (zero-radius alone is not riso) |
| B16 | three identical feature cards / logo wall / fake-dashboard hero / stock faces / 3D renders / particles |
| B17 | dither, ASCII or grain over body text or dense data |
| B18 | endless float, bounce or pulse; parallax everywhere; scroll-jacking |
| B19 | placeholder or selling copy; apologising or vague errors; inconsistent verbs across a flow (e.g. "Save" → "Submitted") |

## C. Accessibility

| ID | Check | Pass when | Evidence |
|----|-------|-----------|----------|
| C1 | Text contrast | every text/background pair ≥ 4.5:1 (≥ 3:1 for ≥ 24 px or ≥ 19 px bold), in both themes, including placeholders and text on plates | axe report + the ratio of the two weakest pairs |
| C2 | Non-text contrast | input borders, focus rings, icon-only controls and meaningful graphics ≥ 3:1 (`--line-strong`, `--focus` + halo, keyline) | ratios of the input border and the focus ring on its background |
| C3 | Colour not alone | pink / blue / overprint meaning is doubled by a label, tab, icon or position (donut legend, source tabs, selected states) | crop with the second cue circled |
| C4 | Focus visible | every interactive element shows the 2 px `--focus` ring (+ paper halo on plates) on Tab; nothing shows a ring on mouse focus | keyboard-only video or 3 crops (button, row, input) |
| C5 | Keyboard path | the screen's full flow completes with keyboard only (Tab order sensible, Esc closes, Enter activates, arrows in lists/menus, Ctrl/⌘+K and ⌘+B work) | step list with the keys used |
| C6 | Reduced motion | with `reducedMotion: 'reduce'` nothing translates, scales or rotates; loops static; Lenis smoothing off | Playwright reduced-motion test name + a still |
| C7 | 390 px | no horizontal scroll (`scrollWidth <= innerWidth`), no text under 11 px, touch targets ≥ 44 px, display sizes clamped, drawer works | 390 shot + the scroll assertion |
| C8 | Axe | no serious or critical violations | axe JSON summary |
| C9 | Names and roles | accessible names unchanged (section D), decorative SVG / dither / grain `aria-hidden`, loaders `role="status"`, toasts announced, `aria-live` for ticking numbers | tree excerpt |
| C10 | Hover has a twin | each hover effect has a focus-visible twin and a touch press state; no hover-only information | 3 pairs of crops |
| C11 | Motion safety | no element flashes more than 3 times per second (grain cycle at 8 fps is opacity ≤ .09 and passes; halftone loaders are slow waves) | frame strip |
| C12 | Theme toggle | Light / Dark / System radios work and persist; `color-scheme` switches so native controls follow | both shots of the same state |

## D. Copy parity (feature-parity gate)

| ID | Check | Pass when | Evidence |
|----|-------|-----------|----------|
| D1 | Spec strings | every string in `riso-system.md` §12 for this screen is present byte-for-byte with the same role | the screen's e2e spec passes unchanged |
| D2 | Test ids and classes | `mix-percent`, `mix-row` (+ `bg-surface-sunk` on the hovered legend row), `import-prompt` still exist | spec run |
| D3 | Verb consistency | the action name is the same on the button, in the dialog title and in the toast ("Add memory" → "Memory added") | list of flows |
| D4 | Sentence case | all UI text is sentence case; no title case, no all caps | scan of headings and buttons |
| D5 | Empty and error states | empty states say what to do next with one action; errors say what happened and how to fix it, without apologising | crops |
| D6 | No new copy drift | placeholder text, hints and page titles match the current app unless the task recorded a reason | diff of visible strings |
| D7 | Nav labels | `src/lib/nav.ts` labels unchanged (Posts, Ideas, Activities, Analytics, Strategy, For you, …) | sidebar crop |

## E. Motion conformance

| ID | Check | Pass when | Evidence |
|----|-------|-----------|----------|
| E1 | Catalogue only | every animation on the screen is an entry in `micro-interactions.md` with its preset; nothing improvised | list of IDs used |
| E2 | Properties | only transform / opacity / filter (clip-path in B3) animate; no `box-shadow`, `width`, `height`, `top`, `left`, `background-position` | DevTools Animations panel |
| E3 | Budget | nothing longer than 400 ms in-app; home orchestration ≤ 600 ms; one looping animation at most | timings from the trace |
| E4 | Trace | 60 fps on the `/design` block for this screen's moment at 4× CPU throttle, per the procedure in `micro-interactions.md` §8 | trace file path |
| E5 | Lenis | smooth scroll inside the sheet; nested scrollers excluded; anchors, sticky header, keyboard scroll, find-in-page and focus scroll work | the Lenis Playwright checks |
| E6 | Bundle | home route JS within +40 KB gz of the pre-redesign build | `next build` size lines before / after |
