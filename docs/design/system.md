# Drafting table: the Brandloop design system

Version 2, 2026-10-21. Replaces the Riso Print system (`riso-system.md`, rewritten in place and renamed to this file).
Chosen by the user from the Heron-like direction: precise, technical, calm, expert, architectural. Companions:
`micro-interactions.md` (motion), `critic-rubric.md` (review), `components.md` (provenance). Values here are the source
of truth for `packages/ui/src/tokens.css` and `drafting.css`.

## 1. Concept

1. One sheet on a drafting table. Paper, graphite and hairlines carry everything; structure is drawn, not decorated:
   construction grids, ruled margins, dimension lines with tick marks, crosshair marks at the corners.
2. One red, for status only. `--signal` marks errors, destructive actions and live or active indicators. It is never a
   brand accent, a hover colour or decoration. Primary actions are graphite plates.
3. Type is a tight grotesk, never wide: Archivo at width 92 to 100 with tight tracking against small Hanken text.
4. Motion is the drafting itself: lines and grids draw in from an origin, panels slide in on rails, values count up,
   the greeting sets in by weight and tracking, primary buttons press onto their plate. Routes switch instantly; the
   cursor is the native cursor.
5. Night is drafting at night: dark paper, light graphite, the same lines and the same signal rule.

## 2. Palette

### 2.1 Roles

| Token | Carries text? | Where it appears |
|-------|---------------|------------------|
| ink (graphite) | yes (default) | text, icons, keylines, primary button face, links, focus ring, current rows |
| ink-muted / ink-faint | yes | secondary text; placeholders and hints (faint only on paper, surface, sunk) |
| line / line-strong / keyline | no | hairlines and grids / perceivable boundaries, ticks, marks, the button plate / plate edges |
| signal | never as text | live dot, destructive frame, error border |
| signal-ink | yes | error messages, destructive labels |
| signal-soft | stock | error callouts, destructive hover |
| ghost | display only | the clipped index label |

### 2.2 Day

| Token | Hex | Role |
|-------|-----|------|
| `--paper` | `#F3F1EC` | the desk: html/body, sidebar, grid ground, auth background |
| `--surface` | `#FBFAF7` | the sheet: app card, dialogs, popovers, inputs at rest |
| `--surface-sunk` | `#EAE8E2` | sunk fields: hover rows, keycaps, skeleton base |
| `--ink` | `#1C1C1C` | graphite: text, icons, keylines, primary face, links, focus |
| `--ink-muted` | `#5B5A56` | secondary text, nav at rest |
| `--ink-faint` | `#66655F` | placeholders, hints |
| `--line` | `#C9C6BF` | hairlines, construction grid, dividers, ruled margin |
| `--line-strong` | `#807D76` | input borders, ticks, crosshair marks, the 2 px button plate |
| `--keyline` | `#1C1C1C` | 1 px plate edge |
| `--plate` | `#1C1C1C` | the 1 px graphite offset of raised plates |
| `--signal` | `#E5482A` | status graphic |
| `--signal-ink` | `#B2351C` | status text |
| `--signal-soft` | `#F8E0D9` | status stock |
| `--ghost` | `#E2DFD8` | ghost display type |
| `--on-ink` | `#F3F1EC` | text on a graphite plate |
| `--on-signal` | `#1C1C1C` | text on a signal plate (not used in the app today) |

Aliases kept so screens re-skin without a rewrite: `--accent` = ink, `--on-accent` = on-ink, `--accent-soft` =
surface-sunk, `--focus` = ink, `--danger` = signal-ink, `--on-danger` = on-ink. Removed with the direction: pink, blue,
overprint, stock-pink, stock-blue, highlight, plate-shadow, misreg and grain tokens.

### 2.3 Night

| Token | Hex | Note |
|-------|-----|------|
| `--paper` | `#15161A` | dark paper |
| `--surface` | `#1B1C21` | the sheet, a step lighter |
| `--surface-sunk` | `#0F1013` | |
| `--ink` | `#E8E6E1` | light graphite |
| `--ink-muted` | `#A8A6A0` | |
| `--ink-faint` | `#8E8C86` | |
| `--line` | `#34363C` | |
| `--line-strong` | `#6B6E77` | |
| `--keyline` / `--plate` | `#B9B7B1` | softened so 1 px edges do not glare (9.0:1 on paper) |
| `--signal` | `#E5482A` | same red, 4.6:1 on night paper as a graphic |
| `--signal-ink` | `#F0674D` | status text |
| `--signal-soft` | `#3A1F1A` | |
| `--ghost` | `#232429` | |
| `--on-ink` / `--on-signal` | `#15161A` | dark text on the light plate |

### 2.4 Contrast (WCAG 2.x; AA text 4.5:1, large text and non-text 3:1)

| Pair | Day paper | Day surface | Day sunk | Night paper | Night surface | Night sunk |
|------|----------:|------------:|---------:|------------:|--------------:|-----------:|
| ink | 15.10 | 16.33 | 13.91 | 14.50 | 13.64 | 15.25 |
| ink-muted | 6.12 | 6.61 | 5.63 | 7.43 | 6.99 | 7.82 |
| ink-faint | 4.80 | 5.19 | 4.70 | 5.38 | 5.06 | 5.66 |
| signal-ink (text) | 5.44 | 5.88 | 5.01 | 5.81 | 5.47 | 6.12 |
| signal (graphic) | 3.52 | 3.80 | 3.24 | 4.56 | 4.29 | 4.79 |
| line-strong (boundary) | 3.64 | 3.93 | 3.35 | 3.55 | 3.34 | 3.73 |

On plates: on-ink on ink 15.10 day / 14.50 night; ink on signal-soft 13.52 / 12.11; signal-ink on signal-soft 4.87 /
4.85; keyline on night paper 9.01. `--line` (1.5:1) is decorative only and never a required boundary. Rejected: ink
text on signal (4.29 day, 3.18 night) and paper text on signal, so signal never carries text; destructive buttons are
signal frames with signal-ink text.

### 2.5 Tailwind mapping

`@theme inline` exposes `--color-paper`, `--color-surface`, `--color-surface-sunk`, `--color-ink`, `--color-ink-muted`,
`--color-ink-faint`, `--color-line`, `--color-line-strong`, `--color-keyline`, `--color-plate`, `--color-signal`,
`--color-signal-ink`, `--color-signal-soft`, `--color-ghost`, `--color-on-ink`, `--color-on-signal`, `--color-accent`,
`--color-accent-soft`, `--color-on-accent`, `--color-focus`, `--color-danger`, `--color-on-danger`. Radii:
`--radius-control: 2px` (row, card), `--radius-pill: 999px`. Shadows: `--shadow-sm/-raised/-overlay` are all
`1px 1px 0 0 var(--plate)`. Theme switch stays `next-themes` with `attribute="class"` plus `data-theme`.

## 3. Type

### 3.1 Families

**Display: Archivo, tight.** The same variable file (`axes: ["wdth"]`, `wght` 100–900) set at width 92 for display,
96 for title-1 and 100 for title-2, weights 700 / 600, tracking −0.035 to −0.015 em. Never above width 100. **UI and
body: Hanken Grotesk** 400 / 500 / 600. No third family, no monospace anywhere; captions, keycaps and counters are
Hanken at 13 or 11 px with tabular numerals.

### 3.2 Scale

| Step | Face / weight / width | Size | Line | Tracking | Use | 390 px |
|------|-----------------------|-----:|-----:|---------:|-----|--------|
| display-1 | Archivo 700, 92 | clamp(36px, 6.4vw, 80px) | 0.98 | −0.035 | home greeting, auth wordmark | 36 |
| display-2 | Archivo 700, 92 | clamp(30px, 5vw, 48px) | 1.02 | −0.03 | empty-state headline | 30 |
| title-1 | Archivo 600, 96 | 28 | 1.1 | −0.025 | strategy section heads, dialog hero line, the donut value | 24 |
| title-2 | Archivo 600, 100 | 20 | 1.2 | −0.015 | page header title, dialog and card titles, wordmark, section panel title | 18 |
| title-3 | Hanken 600 | 16 | 1.3 | 0 | group titles | 16 |
| body | Hanken 400 | 15 | 1.6 | 0 | reading text | 15 |
| ui | Hanken 400 / 500 | 14 | 1.45 | 0 | controls, nav rows, inputs, buttons | 14 |
| caption | Hanken 500, tabular | 13 | 1.4 | +0.01 | metadata, chips, hints, keycaps, dimension labels | 13 |
| micro | Hanken 600, tabular | 11 | 1.3 | +0.02 | counters, badges, monogram initials | 11 |

Rules: nothing between 20 and 28 px except title-1; nothing under 11 px; the display face never under 18 px; uppercase
only for monogram initials; emphasis inside a sentence is weight 600, never colour.

### 3.3 Measure and setting

Reading text max 68 ch; UI rows 56 ch; captions 44 ch; display lines max 14 words. Left-aligned everywhere (centred only
for auth). Tabular numerals on captions, inputs, legends and ticking numbers.

## 4. Spacing, grid, radii, lines

- Base unit 4 px; the construction grid is 32 px; scale 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Content column max 768 px, gutter 24 px (16 at 390); the home hero column max 880 px.
- Desk and sheet: the window is paper with the construction grid; the sheet is `--surface`, inset 12 px top / right /
  bottom on ≥ 768 px, 1 px keyline, 1 px graphite offset, radius 2, with a ruled margin 24 px from its left edge. At
  < 768 px the sheet is full-bleed with a 56 px top bar and no ruler.
- Radii: 2 px on controls, sheets, dialogs, popovers, avatars; pills only on chips and the live dot.
- Hairlines: `--line` for dividers, grids and rules; `--line-strong` for input borders, ticks and marks; `--keyline` for
  plate edges. Never two lines within 4 px of each other.
- 390 px: single column; sidebar becomes the drawer; no element wider than the viewport; touch targets ≥ 44 px.

## 5. Drafting devices

Every device is CSS or inline SVG, animates transform / opacity / stroke only, and is `aria-hidden` when decorative.

### 5.1 Plates and elevation

`.plate { background: var(--surface); border: 1px solid var(--keyline); border-radius: 2px }`; `.plate--raised`,
`.plate--overlay` (and `--sm`) add `box-shadow: 1px 1px 0 0 var(--plate)`. Three elevations: flat (hairline), raised
(sheet, popovers, menus: + 1 px offset), overlay (dialogs, palette: + 1 px offset and the `--ink` 40 % scrim). No blur,
no `backdrop-filter`, nothing lifts on hover.

### 5.2 Construction grid

The desk carries `background-image: linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, …)`
at 32 px; `--grid-line` is `--line` at 55 %. The sheet covers it; only the sidebar sits on it.

### 5.3 Crosshair marks, ruled margin, dimension lines

- Crosshair: 11 × 11 px, 1 px `--line-strong`, at the four desk corners (12 px inset) and around framed figures.
- Ruled margin: a `--line` hairline 24 px inside the sheet's left edge with 4 px `--line-strong` ticks every 32 px and
  8 px ticks every 128 px.
- Dimension line: a `--line-strong` hairline with 8 px end ticks and a centred caption label on the surface stating a
  real measure (the composer's width is 880). It draws in from the left (`scaleX`), the label fades up after.

### 5.4 Line drawings

Monochrome SVG line art in `currentColor` (`LineArt`: `sheet`, `stack`, `compass`), 1.25 px strokes with
`vector-effect: non-scaling-stroke`, every element `pathLength="1"` and drawn by `stroke-dashoffset` on a 90 ms stagger.
Used for the home hero (the sheet and pencil) and empty states (the framed stack). Complete at once under reduced
motion.

### 5.5 Skeleton

A sunk bar with one `--line-strong` hairline sweeping across (1.2 s linear); hidden under reduced motion.

### 5.6 Monograms

Avatars are graphite line monograms: hairline `--keyline` frame (square for profiles, circle for voices, ring weight 1
or 2 px per preset), CSS-generated initials in ink, photos replace the initials. Decorative: the owning control names
the person.

## 6. Elevation and state rules

| Primitive | Rest | Hover | Focus-visible | Active | Disabled | Selected / current |
|-----------|------|-------|---------------|--------|----------|--------------------|
| Button primary (and `generate`) | graphite face on a 2 px `--line-strong` plate | plate darkens to keyline | ring + paper halo | face lands on the plate (2 px) | sunk face, faint text, hairline | — |
| Button secondary | hairline keyline frame | sunk fill | ring | 1 px translate | `--line` frame, faint text | — |
| Button danger | `--signal` frame, signal-ink text | signal-soft fill | ring | 1 px translate | as secondary | — |
| Button ghost | muted text | sunk fill, ink text | ring | 1 px translate | faint text | — |
| Input / Textarea / Select | surface, `--line-strong` border | keyline border | ring | — | sunk, faint | invalid: signal border + signal-ink caption |
| Tab (home starters) | hairline face, graphite plate flush behind | plate offsets 1 px, label rolls | ring | face onto plate | faint | — |
| Nav row | muted text | graphite bar sweeps in from the left, label rolls, paper text | bar + ring | — | — | current: bar held, `aria-current="page"` |
| Menu / palette item | ink text | graphite bar, paper text | same | — | faint | check in ink |
| Theme radio | ghost | sunk | ring | — | — | graphite plate, paper icon |
| Avatar | line monogram | — | ring on the owning control | — | — | — |
| Link | ink, underline on hover and focus | underline | ring | — | — | — |

Focus ring everywhere: `outline: 2px solid var(--focus); outline-offset: 2px`; on graphite plates add
`box-shadow: 0 0 0 2px var(--paper)`. `:focus` without `-visible` shows nothing. Status is never colour alone: the live
dot has a label, the destructive frame has its verb, errors have text.

## 7. Iconography

Lucide only. 16 px in rows, buttons and inputs (stroke 1.75); 14 px inside tabs and captions; 20 px in page headers and
empty states (stroke 1.5). Current nav icon stroke 2.25. Icons inherit `currentColor`; the only coloured graphic is the
signal dot, and only for a live or error state. No sparkle, wand or star icons.

## 8. Component inventory (`packages/ui`)

| Component | Anatomy | Notes |
|-----------|---------|-------|
| Button | plate (button) + face (span) for primary / generate; flat frames for secondary, danger, ghost; sizes sm 32, md 36, icon 32, icon-lg 40 | keyboard press mirrors the pointer for 120 ms |
| Input, Textarea, NativeSelect, Label, Hint | hairline controls | `--line-strong` rest border, keyline hover, graphite ring |
| KineticHeading | `aria-label` + one `aria-hidden` letter layer | weight 300 → 700, tracking .06 → −.035 em per letter |
| LineArt | SVG drawings `sheet`, `stack`, `compass` | strokes draw in; `currentColor` |
| CountUp | tweened number, tabular | 420 ms; final value at once under reduced motion |
| SmoothScroll (`@brandloop/ui/scroll`) | Lenis wrapper mode on Motion's frame loop | native under reduced motion |
| Reveal (`@brandloop/ui/scroll`) | `whileInView` once | below-fold content only |
| MotionProvider (`@brandloop/ui/motion`) | `LazyMotion` with lazily imported features, `reducedMotion="user"` | imported by the root layout through the subpath so auth pages carry no Lenis |
| Frame (apps/web `page.tsx`) | four crosshair marks around a figure | empty states, placeholders |

## 9. Shell layout

| Region | Spec |
|--------|------|
| Desk | `--paper` with the 32 px construction grid; crosshair marks at its four corners (≥ 768 px) |
| Sidebar, the index (248 px) | brand row (graphite mark + wordmark in title-2), search and collapse icon buttons; `nav[aria-label="Main"]` rows h 36 with the graphite-bar sweep and label roll; "Chats"; the clipped **index label** (current or hovered page name, Archivo 700 / 92 at 84 px in `--ghost`) above the profile row; profile menu on a top hairline |
| Rail (56 px) | mark, search, icon rows (sr-only labels), expand, profile |
| Section panel (228 px) | title-2 header, caption group labels, rows as sidebar, its own index label; slides in on its rail (12 px, 320 ms) |
| Sheet | `--surface`, keyline, 1 px graphite offset, radius 2, inset 12 px; ruled margin at 24 px; the Lenis wrapper scrolls inside it (content padded 32 px left on ≥ 768 px) |
| Page header | h 56, sticky, opaque surface; title-2 after a 1 × 20 px keyline rule that draws down; the bottom hairline draws in from the left |
| Command palette | overlay plate 560 max, input h 48, Esc keycap, group captions, rows h 36 inverting to a graphite bar; `data-lenis-prevent` on the list; placeholder "Search pages and profiles…" |
| Profile menu | raised plate 256; profile rows with monograms; "Add profile"; "Settings"; theme radiogroup (Light / Dark / System) as graphite squares; "Sign out" in signal-ink |
| Mobile drawer | `min(300px, 86vw)`, paper, keyline right edge, slides in on transform (260 ms); close button top-right |
| Route change | **No page transitions: routes switch instantly (user decision 2026-10-21).** Focus moves to the new `h1` (or `main`), with no ring on the heading |
| Cursor | the native cursor everywhere (a custom cursor was built and removed on the user's decision, 2026-10-21) |
| Smooth scroll | Lenis wrapper mode inside the sheet; native under reduced motion |
| Auth | paper desk with the grid, graphite wordmark, Clerk card on a plate; Clerk `appearance.variables`: `colorPrimary` ink, `colorForeground` ink, `colorBackground` surface, `colorDanger` signal-ink, `borderRadius: "2px"`, `fontFamily` / `fontFamilyMono` = the UI face |

## 10. Composition and motion score

Rules: one-shots 600–1200 ms; feedback ≤ 200 ms and never blocking input; `prefers-reduced-motion` renders the final
frame of every sequence (no Lenis smoothing, lines drawn, numbers final); no page transitions, no custom cursor, no
looping decoration. Budgets in `micro-interactions.md` §8.

### 10.1 Shell

| t (ms) | Score |
|-------:|-------|
| page mount 0–600 | the header's bottom rule draws in from the left; the title's short rule draws down |
| section mount 0–320 | the section panel slides in on its rail (−12 px → 0, opacity) |
| nav hover 0–200 | graphite bar `scaleX 0 → 1` from the left; label rolls up as its hidden duplicate rolls in; the index label swaps by a 260 ms roll |
| collapse / expand 0–240 | sidebar width tweens |
| palette / dialogs 0–180 | plate stamps in (`scale .96 → 1`, opacity); fade out 120 ms |
| drawer 0–260 | slides in on transform; 180 ms out |

### 10.2 Home

Composition: caption greeting, the kinetic display heading (two lines ≥ 640 px, three below), the composer sheet on a
1 px plate, a dimension line stating its width, five hairline tabs; on ≥ 1024 px the sheet-and-pencil line drawing sits
at the column's top right.

| t (ms) | Score |
|-------:|-------|
| 160–1200 | greeting sets in: per letter `opacity 0 → 1`, `translateY .12em → 0`, `font-weight 300 → 700`, `letter-spacing .06em → −.035em`, 480 ms, 22 ms stagger |
| 520–1060 | the composer lands (`translateY −24px`, `scale 1.01`, spring 320 / 26); its 1 px plate slides out at 680 ms |
| 700–1700 | the line drawing draws itself, stroke by stroke |
| 820–1070 | the tabs rise in (8 px, 240 ms, 50 ms stagger) |
| 900–1600 | the dimension line draws from the left; its label fades up at 1400 |
| feedback | tab hover: plate offsets 1 px, label rolls; Send press: face onto plate; composer focus: graphite ring |

### 10.3 Other screens

Memories: cards reveal on scroll (12 px, 420 ms, 40 ms stagger); the empty state carries the framed stack drawing.
Strategy: the donut value counts up, the audience meters draw from the left, segments are graphite weights. Settings and
team: forms on the 4 px grid, monograms in the profile list, destructive actions as signal frames. Placeholders: the
framed stack drawing beside the copy. `/design`: every device above as a live specimen.

## 11. Slop checklist (every item is a hard fail)

- cream with a serif and a terracotta accent; near-black with a single acid accent; identical rounded cards with soft
  shadows and gradient washes; all-caps eyebrows; `A · B · C` strings; "→" on buttons; one accented word in a headline;
  mono data labels; fade-and-slide-up on every section
- any gradient, blur, glow, glassmorphism, `backdrop-filter`; sparkle / wand / star icons; floating orbs
- **riso devices**: misregistered colour plates or copies, overprint shapes, dither / halftone / ASCII fields, grain,
  coloured offset shadows, two-ink chips
- **custom cursors** of any kind; **page transitions** of any kind
- signal red as decoration, hover colour or brand accent
- `01 / 02 / 03` markers on non-sequential content; `WORD — fragment` labels; `#111` as ink or `#FFFFFF` as paper
- stock 3D renders, bokeh, particles, fake testimonials; placeholder or selling copy; errors that apologise

## 12. Load-bearing copy (feature-parity gate)

Strings asserted by `apps/web/e2e/*.spec.ts` through accessible names. Keep them byte for byte; a change requires
updating the spec in the same commit with a recorded reason.

| Spec | Role / kind | String |
|------|-------------|--------|
| shell, showpiece | heading | `What are we writing today?` |
| shell | navigation name + link | `Main` → link `Posts` |
| shell | button | `Profile menu` — the full name is `Profile menu, <profile name>` on the wide sidebar (the visible name must be part of the accessible name, axe `label-content-name-mismatch`); the rail's icon-only trigger is `Profile menu` alone. Specs match by substring |
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
| strategy | testids | `mix-percent` (5 inputs summing to 100), `mix-row` (hover adds class `bg-surface-sunk`) |
| strategy | group | `Content mix chart` (SVG role group) |
| strategy | button / label | `Edit tagline` / `tagline` (exact) |
| strategy | label / toast | `Educational percent` / `Strategy saved` |
| strategy | button / alertdialog text | `Regenerate strategy` / `A new strategy will replace the current one, including your edits.` |
| voice | button / combobox | `Change writing style` — the full name is `Change writing style, <voice name>` (same axe rule; the visible voice name is part of it); specs match by substring / `Search writing styles` |
| voice | options | `Odalys Brennan`, `Callum Strand`, `Add your style` (all nine preset names stay) |
| voice | toast / group | `Writing style: {name}` / `Selected writing style` |
| voice | label / button / alert | `Your posts` / `Learn my style` / `Paste at least 3 posts of 200+ characters` |
| design | heading | `Drafting table` (the style guide's own spec; was `Riso print`) |

Also keep: `Open navigation`, `Close navigation`, `Search (Ctrl K)`, `Collapse sidebar`, `Expand sidebar`,
`Brandloop home`, `Theme` + `Light` / `Dark` / `System`, `Sign out`, `Nothing matches that search.`,
`Nothing here yet.`, `No strategy yet`, `Replace your strategy?` / `Replace strategy`, `Delete this memory?`,
`Strategy ready`, `Memories imported`, `Prompt copied`, `Your writing style is ready`, page titles `Posts`, `Memories`,
`Manage account`, `Manage team`, `Strategy`, and the nav labels in `src/lib/nav.ts`.

## 13. Decisions and deviations

- Riso Print (pink, blue, overprint, misregistration, grain, dither, coloured plates) is dropped entirely; this file
  replaces `riso-system.md` in place (git rename) so history stays attached.
- Signal red never carries text: destructive buttons are signal frames with `--signal-ink` text, because ink or paper
  text on `#E5482A` fails AA.
- `--ink-faint` day is `#66655F` (not a lighter grey) so placeholders pass 4.5:1 on sunk fields.
- Avatars stay square (profiles) and round (voices) as before; both are line monograms.
- The composer's dimension line states 880, the column's real max width; measures are never fictional.
- No page transitions and no custom cursor (user decisions, 2026-10-21).
