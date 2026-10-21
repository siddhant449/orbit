# Micro-interactions catalogue (Drafting table)

Version 2, 2026-10-21. Replaces the Riso Print catalogue. Tokens and devices refer to `system.md`; recipes live in
`packages/ui/src/drafting.css` and `tokens.css`. Rules that apply to all entries:

- Animate `transform`, `opacity` and `stroke-dashoffset` only, plus `font-weight` / `letter-spacing` on the one kinetic
  heading. A plate is an element moved by transform, never an animated `box-shadow`.
- Every hover has a `:focus-visible` twin; touch gets `:active`. Nothing depends on hover to be discoverable.
- `<MotionConfig reducedMotion="user">` at the app root (`@brandloop/ui/motion`); CSS motion is gated by
  `@media (prefers-reduced-motion: reduce)`, under which every entry renders its final frame (lines drawn, numbers
  final, panels in place) and Lenis is native.
- Motion imports: `motion/react` through `LazyMotion` with lazily imported features; `m.*` components only.
- Durations: one-shots 600–1200 ms; interaction feedback ≤ 200 ms and never blocking input; no loops except the
  skeleton sweep.
- No page transitions: routes switch instantly (user decision 2026-10-21). No custom cursor.

## 0. Presets

| Preset | Definition | Used for |
|--------|------------|----------|
| `ease-ink` | `cubic-bezier(.2, .7, .2, 1)` | hovers, reveals, draws |
| `ease-exit` | `cubic-bezier(.4, 0, .8, .4)` | exits, dismissals |
| `spring-press` | CSS `linear()` of spring 500 / 30 (≈ 300 ms) | the button face returning to rest |
| `spring-land` | CSS `linear()` of spring 320 / 26 (540 ms) | the composer landing |
| `cinematic` (`presets.ts`) | `set` 480 ms at 22 ms, `land` 320 / 26, `stamp` 180 ms at 60 ms, `roll` 260 ms, `reveal` 420 ms at 40 ms, `count` 420 ms, `draw` 700 ms | the entries below |

## 1. Buttons

| ID | Interaction | Animates | Timing | Reduced motion |
|----|-------------|----------|--------|----------------|
| B1 | Graphite press | the face `translate 0 → 2px 2px` onto the static `--line-strong` plate on `:active` / `data-pressed` (keyboard Space / Enter for 120 ms); springs back | 120 ms down, 300 ms spring up | instant |
| B2 | Plate darkens | the plate `--line-strong → --keyline` on hover / focus | 160 ms | instant |
| B3 | Frame hover | secondary / danger / ghost: fill `--surface-sunk` / `--signal-soft` / `--surface-sunk`, 1 px translate on active | 160 ms | instant |

## 2. Hover

| ID | Interaction | Animates | Timing | Reduced motion |
|----|-------------|----------|--------|----------------|
| H1 | Nav bar sweep | graphite bar `scaleX 0 → 1` from the left; text to `--on-ink` | 200 ms, leave 120 ms | bar appears |
| H2 | Label roll | the label rolls up out of its clip while an `aria-hidden` duplicate rolls in (nav rows, tabs) | 200 ms | swap |
| H3 | Tab plate | the 1 px graphite plate behind a tab offsets `0 → 1px 1px` and the frame darkens | 160 ms | instant |
| H4 | Row highlight | menu / palette rows invert to a graphite bar | instant | same |

## 3. Draws and counts (SVG and lines)

| ID | Interaction | Animates | Timing | Reduced motion |
|----|-------------|----------|--------|----------------|
| S1 | Rule draw | header rules `scaleX 0 → 1` (`.rule-draw`) or `scaleY` (`.rule-draw--y`) from their origin | 600 ms | drawn |
| S2 | Dimension line | hairline `scaleX` from the left, label fades up 500 ms later | 700 ms | drawn |
| S3 | Line art | every stroke `stroke-dashoffset 1 → 0` on a 90 ms stagger (`pathLength="1"`) | 900 ms per stroke | complete |
| S4 | Meter draw | the fill `scaleX 0 → 1` from the left (`.meter-fill`) | 700 ms | full |
| S5 | Count up | the donut value tweens to its number, tabular | 420 ms | final |
| S6 | Skeleton | one hairline sweeps the sunk bar | 1.2 s loop | hidden |

## 4. Text

| ID | Interaction | Animates | Timing | Reduced motion |
|----|-------------|----------|--------|----------------|
| T1 | Kinetic heading | per letter `opacity 0 → 1`, `translateY .12em → 0`, `font-weight 300 → 700`, `letter-spacing .06em → −.035em`; `h1[aria-label]`, letters `aria-hidden` | 480 ms, 22 ms stagger, starts at 160 ms | final |

## 5. Panels, objects and lists

| ID | Interaction | Animates | Timing | Reduced motion |
|----|-------------|----------|--------|----------------|
| R1 | Route change | nothing: routes switch instantly; focus moves to the new `h1` or `main` | 0 | same |
| R2 | Sidebar collapse | aside width tweens to the rail | 240 ms | instant |
| R3 | Section panel | slides in on its rail (`−12px → 0`, opacity) on mount | 320 ms | in place |
| R4 | Drawer | `translateX −100% → 0`; scrim fades | 260 / 180 ms | opacity |
| R5 | Dialog / palette / menu | plate `scale .96 → 1` + opacity; fade out | 180 / 120 ms | opacity |
| R6 | Object landing | the composer `translateY −24px → 0`, `scale 1.01 → 1` on `spring-land`; its 1 px plate slides out 160 ms later | 540 ms | in place |
| R7 | Rise-in stagger | tabs (and later list entries) `translateY 8px → 0` + opacity | 240 ms, 50 ms stagger | in place |
| R8 | Scroll reveal | `opacity 0 → 1`, `translateY 12px → 0` once in view; siblings 40 ms apart; never first-fold, never > 20 rows | 420 ms | in place |

### 5.1 The home load moment

| t (ms) | What happens |
|-------:|--------------|
| 0 | desk, index and sheet are in their final layout; the header rules of other pages draw in |
| 160–1200 | the greeting sets in letter by letter (T1) |
| 520–1060 | the composer lands; its plate slides out at 680 (R6) |
| 700–1700 | the sheet-and-pencil drawing draws itself (S3, ≥ 1024 px) |
| 820–1070 | the five tabs rise in (R7) |
| 900–1600 | the dimension line draws, its label fades up at 1400 (S2) |

## 6. Smooth scrolling (Lenis)

`SmoothScroll` (`@brandloop/ui/scroll`), wrapper mode around the sheet's scroll region: `{ lerp: .12, duration: 1.1,
smoothWheel: true, syncTouch: false, autoRaf: false, anchors: true, autoResize: true }`, driven from Motion's
`frame.update` and cancelled on unmount. `data-lenis-prevent` on the palette list, the drawer, dropdown and popover
contents, the sidebar lists and every textarea. `respectReducedMotion` (default true) turns smoothing off live.

## 7. Reduced-motion matrix

| Category | Behaviour |
|----------|-----------|
| Presses, hovers | instant state changes; colour and plate changes remain |
| Draws (S1–S5) | drawn, full, final |
| Kinetic heading | final weight and tracking from the first frame |
| Landing, rise, panels, reveals | in place |
| Dialogs, drawer | opacity only |
| Lenis | native scroll |

## 8. Motion budget

- Home initial JS adds ≤ 90 KB gzip eagerly over the pre-D2 baseline (264,361 B); lazy chunks are recorded beside the
  first-load figure in `docs/features/ui-redesign/bundle-baseline.md`.
- Only transform, opacity, stroke-dashoffset and the heading's weight / tracking animate; hero sequences hold 60 fps on a
  mid laptop; feedback ≤ 200 ms (INP < 200 ms).
- Nothing is loaded for decoration: no canvas, no WebGL, no cursor chunk.

## 9. Catalogue by device (what each screen carries)

| ID | Device | Where |
|----|--------|-------|
| D1 | rules and grids draw in | page headers (S1), composer dimension line (S2), `/design` |
| D2 | kinetic heading by weight and tracking | home greeting (T1), `/design` specimen |
| D3 | panels slide on rails | section panel (R3), drawer (R4) |
| D4 | values count up, meters draw | strategy donut value (S5), audience meters (S4) |
| D5 | line art draws | home hero, memories empty state, placeholders, `/design` (S3) |
| D6 | object landing | composer (R6) |
| D7 | rise-in stagger | home tabs (R7) |
| D8 | scroll reveal | memories cards (R8) |
