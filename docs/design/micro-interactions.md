# Micro-interactions catalogue (Riso Print)

Version 1, 2026-10-21 (D1.2). Pattern IDs (P01–P40) refer to `interaction-research.md` §6; tokens and devices refer to
`riso-system.md`. Every interaction here is demoed on `/design` (D1.3) and implemented in D2–D4. Rules that apply to
all entries:

- Animate `transform`, `opacity` and `filter` only. A hard shadow is an element moved by transform, never an animated
  `box-shadow`. `clip-path` is allowed only where an entry says so (it is composited, but check it in the trace).
- Every hover has a `:focus-visible` twin; touch devices get the `:active` state instead of hover (P19). Nothing
  depends on hover to be discoverable: hover-only affordances carry a visible kbd hint or a label.
- `<MotionConfig reducedMotion="user">` at the app root; CSS motion is gated by `@media (prefers-reduced-motion:
  reduce)`. Under reduced motion every entry collapses to opacity or an instant state swap; colour and shadow changes
  stay as the feedback.
- Motion imports: `motion/react` with `LazyMotion` + `domAnimation`; `m.*` components only; no `framer-motion` import.
- In-app ceiling 400 ms per interaction; page-load orchestration on home ≤ 600 ms total; marketing hero ≤ 900 ms.

## 0. Presets (named once, referenced everywhere)

| Preset | Definition | Used for |
|--------|------------|----------|
| `ease-ink` | `cubic-bezier(.2, .7, .2, 1)` | hovers, reveals, sweeps |
| `ease-exit` | `cubic-bezier(.4, 0, .8, .4)` | exits, dismissals |
| `spring-press` | `{ type: "spring", stiffness: 500, damping: 30, mass: 1 }` (settles ≈ 150 ms) | press and release |
| `spring-layout` | `{ type: "spring", stiffness: 380, damping: 36 }` (≈ 300 ms) | `layout` / `layoutId` moves |
| `stamp` | `initial { opacity: 0, scale: .96 } → animate { opacity: 1, scale: 1 }`, 180 ms `ease-ink` | entries of plates, dialogs, toasts, routes |
| `draw` | `pathLength 0 → 1`, 400 ms `cubic-bezier(.4, 0, .2, 1)` | SVG strokes (logo, tick, underline, donut) |
| `tick` | value tween 400 ms `ease-ink`, tabular numerals | numbers |
| `loader` | `linear`, 1.2 s loop | skeleton sweep, halftone loader |

Durations: hover 200 ms, press ≈ 150 ms (spring), entry 180 ms, exit 120 ms, draw 400 ms, settle 240 ms.

## 1. Buttons

| ID | Interaction | Trigger | Animates | Timing | Reduced motion | Where | Touch / keyboard | Source |
|----|-------------|---------|----------|--------|----------------|-------|------------------|--------|
| B1 | Ink press | `pointerdown` / `:active` on primary, generate, danger | face `translate 0 0 → 4px 4px` onto the static shadow plate; release springs back | `spring-press` down, `spring-press` up | instant translate (no spring); shadow still "collapses" | every raised button | touch: same via `:active`; keyboard: Space/Enter fires `data-pressed` for 120 ms so the press is seen | P01, Originkit `tactile-button` / `dotted-offset-button` |
| B2 | Misregistered hover plates | hover / focus-visible on primary and generate only | two `aria-hidden` plates (pink, blue) behind the face `translate` −2,−1 and +2,+1 px | 200 ms `ease-ink` | plates stay in register; keyline switches to `--pink` | primary / generate buttons | touch: none (press is the feedback); keyboard: on focus-visible | P02 |
| B3 | Outline ink soak | `pointerenter` on secondary; entry side read from the event | ink fill `clip-path: circle(0 at <entry>) → circle(150%)`, label colour flips to `--on-ink` | 220 ms `ease-ink`; exit 160 ms `ease-exit` reversing from the leave side | instant fill | secondary buttons (Cancel, Regenerate strategy, Import memories) | touch: `:active` fills instantly; keyboard: fills from the left on focus-visible | P03, Originkit `radial-reveal-button` |
| B4 | Icon stamp | `pointerdown` on IconButton | `rotate 0 → 6deg`, `scale 1 → .94`, back on release | `spring-press` | `scale .96` only, 80 ms | Send, Attach, Dictate, sidebar icon buttons, close buttons | touch: same; keyboard: Space/Enter triggers 120 ms stamp | P08 |
| B5 | Async morph | submit of an async action (`aria-busy="true"`) | label fades out (opacity 120 ms) → container `layout` shrinks to a 36 px square holding a 3×3 halftone dot loop (dots scale .4 → 1 in a diagonal wave) → on success a hand-drawn tick draws (S5) → after 900 ms `layout` grows back to the label | `spring-layout` for width; `loader` for dots; `draw` for tick; whole cycle ≤ 400 ms excluding the server wait | no layout change: label swaps to "Saving…" text, dots static, tick appears | Save changes, Add memory, Learn my style, Generate / Replace strategy, Add profile | touch: same; keyboard: result announced by the existing toast (`role="status"`); button keeps focus | P06, Motion `layout`, Motion Primitives `text-morph` (idea) |
| B6 | Magnetic pull | pointer within 80 px of a marketing CTA | button `translate` toward the pointer up to 8 px, springs home on leave | `spring-press` | disabled | marketing CTAs only, never in the app | pointer devices only; disabled on touch (`pointer: coarse`) and keyboard | P04, Motion Primitives `magnetic` |

## 2. Hover

| ID | Interaction | Trigger | Animates | Timing | Reduced motion | Where | Touch / keyboard | Source |
|----|-------------|---------|----------|--------|----------------|-------|------------------|--------|
| H1 | Nav ink-bar sweep | hover / focus-visible on a nav row, menu item or command item | an ink plate behind the row `scaleX 0 → 1` from `transform-origin: left`; text switches to `--on-ink` at 40 % of the sweep | 200 ms `ease-ink`; leave 120 ms `ease-exit` | plate appears, no scale | sidebar, rail, section panel, command palette (`data-selected`), dropdown items (`data-highlighted`) | touch: `:active` shows the bar; keyboard: arrow keys move the bar (cmdk / radix roving focus) | P10, Lebedev |
| H2 | Card / row plate slide | hover / focus-visible on a clickable sheet or list row | a `--plate-shadow` element behind the sheet `translate 0 0 → 2px 2px` (sheet itself does not move or lift) | 200 ms `ease-ink` | plate shown without motion | memory lines, profile rows, voice options, knowledge items, clickable sheets | touch: `:active`; keyboard: on focus-visible | P12 |
| H3 | SVG link underline | hover / focus-visible on an inline link | an inline SVG `<line>` under the text, `pathLength 0 → 1`, `vector-effect: non-scaling-stroke`, stroke `--blue` 1.5 px | 240 ms `draw` | underline shown instantly (CSS `text-decoration` fallback) | body links, "How to get your memories", footer links | touch: links need no hover; keyboard: focus-visible draws it | P13, Motion `pathLength` |
| H4 | Chip plate swap | hover / focus-visible on a chip | the two 1 px offset plates swap: pink `translate −1,−1 → 1,1`, blue the inverse | 180 ms `ease-ink` | plates swap colour instantly | composer "Ways to start" chips, filter chips, theme chips | touch: `:active`; keyboard: focus-visible | P14 |
| H5 | Avatar halftone grow | hover / focus-visible on an avatar that has a photo | the full-tone photo layer `opacity 0 → 1` over the dithered mask layer (reads as dots growing) | 200 ms `ease-ink` | same (opacity only) | profile menu, team list, uploaded avatars; preset monograms have no photo and do not animate | touch: none; keyboard: on the owning control's focus-visible | P15 |
| H6 | Highlighter reveal | element enters the viewport (once) | the `--highlight` plate behind a phrase `scaleX 0 → 1` from the left | 320 ms `ease-ink` | plate visible | one phrase per screen at most (strategy tagline, marketing copy) | n/a | P11, Originkit `text-colour-sweep` (idea) |

## 3. SVG

| ID | Interaction | Trigger | Animates | Timing | Reduced motion | Where | Touch / keyboard | Source |
|----|-------------|---------|----------|--------|----------------|-------|------------------|--------|
| S1 | Logo draw | first mount per session (`sessionStorage` flag) | ring path `pathLength 0 → 1` (ink), then the dot `scale 0 → 1`, then pink and blue offset copies `opacity 0 → 1` and settle 3 → 1 px | draw 400 ms, dot 120 ms, settle 240 ms; total 640 ms (auth only; in-app it is instant) | final state rendered | auth pages (full), sidebar mark (static) | n/a; `aria-hidden`, the link keeps `aria-label="Brandloop home"` | P20, Overworld |
| S2 | Two-plate empty state | mount, and on hover of the empty-state plate | pink and blue shapes `translate` from 3× misreg to 1× on mount; on hover drift 2 px apart and back | settle 240 ms `ease-ink`; drift 200 ms | static at 1× | EmptyState, placeholder pages, "Nothing here yet" groups | touch: tap drifts once; keyboard: none (decorative) | P23, P32 |
| S3 | Donut / meter draw-in | section enters the viewport (once per mount) | each segment `pathLength 0 → 1` in sequence pink, blue, overprint, ink, muted; 2 px paper gaps are static | `draw` per segment, 80 ms stagger, total ≤ 400 ms | segments rendered full | strategy content mix, audience balance meters | hover on a segment highlights its legend row (keeps class `bg-surface-sunk`); keyboard: legend rows are focusable and highlight the segment | P13 technique, Motion `pathLength` |
| S4 | Animated grain | marketing / `/design` only | three grain tiles (seeds 7, 11, 19) cycle `opacity` at 8 fps | `steps(1)` 375 ms loop | one static tile | marketing hero, `/design` header; the app grain is always static | n/a (`aria-hidden`, `pointer-events: none`) | P22 |
| S5 | Hand-drawn tick | success inside an async button or a toast | a two-segment path (short down-stroke, long up-stroke) `pathLength 0 → 1` in `--overprint`, 2.5 px round caps, slight 1.5° rotation on the whole mark | 260 ms `draw` | tick shown | B5 success, success toasts, "Current profile" check | n/a | P20 technique |
| S6 | Halftone loader | a wait between 400 ms and the toast (strategy generate, style learning, import) | a 7×7 dot grid; dot `scale .3 → 1 → .3` in a diagonal wave (`translate`-free) | `loader` 1.2 s | dots static at .7 | generate button body, import dialog, knowledge processing | `role="status"` with text ("Drafting your strategy…") | P25, Originkit `halftone-pulse` (idea) |
| S7 | Stamp-in toast | Sonner `toast()` | plate `scale 1.12 → 1`, `rotate -1.5deg → 0`, `opacity 0 → 1`; an overprint ring behind it `scale 1 → 1.3` and `opacity .6 → 0` | 180 ms `stamp`, ring 240 ms; exit 120 ms `ease-exit` opacity | opacity only | all toasts (bottom-right) | `role="status"` already from Sonner | P24, Originkit `wax-seal` (idea) |

## 4. Text

| ID | Interaction | Trigger | Animates | Timing | Reduced motion | Where | Touch / keyboard | Source |
|----|-------------|---------|----------|--------|----------------|-------|------------------|--------|
| T1 | Greeting split-reveal | home mount, once per session | each line of the `h1` is a `display: inline-block` span wiped in by an ink plate: plate `scaleX 0 → 1 → 0` (origin left, then right) while the text `opacity 0 → 1` under it; then the pink/blue copies settle 3× → 1× misreg | per line 320 ms `ease-ink`, 2 lines overlap by 160 ms; settle 240 ms; total ≤ 600 ms | text shown; copies at 1× | home greeting only; marketing headlines reuse it | the `h1` text node stays whole per word with real spaces, so `getByRole("heading", { name: "What are we writing today?" })` passes; copies are `aria-hidden` | P31, P32, Motion Primitives `text-effect` (idea) |
| T2 | Number tick | a number mounts or changes (strategy percentages, counters) | tweened value rendered with `tabular-nums`; the DOM text is the final value immediately for AT (`aria-live="polite"` on the container, animated digits `aria-hidden`) | `tick` 400 ms | final value | strategy mix legend, meters, analytics later | n/a | P36, Motion Primitives `animated-number` (idea) |

Scramble / cipher text (P07, P33) is not used: it adds noise to a writing product and nothing in the app needs it.

## 5. Route, panel and list transitions

| ID | Interaction | Trigger | Animates | Timing | Reduced motion | Notes | Source |
|----|-------------|---------|----------|--------|----------------|-------|--------|
| R1 | Route change | navigation inside `(app)` via `template.tsx` + `AnimatePresence mode="wait"` | incoming page `stamp`; outgoing `opacity 1 → 0` | in 180 ms, out 120 ms | opacity only (already) | the page header is outside the animated region so it does not flash; focus moves to the `h1` | plan |
| R2 | Sidebar collapse / expand | Ctrl/⌘+B or the buttons | sidebar width is a CSS change; the rail and labels crossfade (`opacity`), `layout` on the nav rows keeps icons in place | 200 ms `spring-layout` | instant | `localStorage` state unchanged | plan |
| R3 | Section panel in / out | entering or leaving `/ideas*`, `/settings*`, `/strategy` … | panel `translateX -12px → 0` + opacity | 180 ms `ease-ink` | opacity | content column does not reflow during the move (`layoutRoot` on the sheet) | plan |
| R4 | Mobile drawer | menu button / swipe | drawer `translateX -100% → 0`; scrim opacity | 240 ms `ease-ink`; close 180 ms `ease-exit` | opacity | focus trapped by radix Dialog; `data-lenis-prevent` on the drawer | plan |
| R5 | Dialog / AlertDialog | open / close | plate `stamp`; scrim `opacity 0 → .4` | 180 / 120 ms | opacity | Lenis `stop()` on open, `start()` on close; body gets `data-lenis-prevent` | plan |
| R6 | Popover / menu | open / close | `stamp` from `transform-origin` at the trigger side (radix `--radix-popper-transform-origin`) | 120 / 100 ms | opacity | `data-lenis-prevent` on the content | plan |
| R7 | List change (user-caused) | add, remove, reorder caused by the user's action | `layout` on siblings; the new row `stamp`; the removed row opacity out | `spring-layout`, stagger 30 ms, max 6 items animated | opacity only | stagger never on first paint or on data refresh; the e2e flows (add / edit / delete memory) still find rows after animation | plan |
| R8 | Tabs | tab change | underline plate moves via `layoutId="tab-underline"` | `spring-layout` | instant | content swaps with opacity 120 ms | P29 |
| R9 | Composer open (later) | choosing a chip or focusing the composer | the composer sheet grows via `layout`; chips fade | `spring-layout` | instant | no shared-element flight across routes | Motion Primitives `morphing-dialog` (idea) |

### 5.1 The two orchestrated load moments

Home (once per session, `sessionStorage` key `brandloop:greeted`; chrome never animates on load):

| t (ms) | What happens |
|-------:|--------------|
| 0 | desk, sidebar, sheet and page header render in their final state |
| 0–320 | greeting line 1: ink plate wipes in and out, text revealed underneath (T1) |
| 160–480 | greeting line 2, overlapping by 160 ms |
| 360–600 | pink and blue copies settle 3× → 1× misreg; composer sheet `stamp` (180 ms) starts at 360 |
| 600 | done; chips were static throughout; Send button is the only blue on the page |

Auth (once per session):

| t (ms) | What happens |
|-------:|--------------|
| 0–400 | logo ring draws (S1) |
| 400–520 | the dot scales in |
| 400–640 | pink and blue copies of the mark and of the wordmark settle 3 → 1 px |
| 640 | done; the Clerk card was visible and usable from t = 0 |

Reduced motion: both tables collapse to the t = final state at 0 ms.

## 6. Smooth scrolling (Lenis)

Package `lenis` (`lenis/react`, `lenis/dist/lenis.css` imported once in `globals.css`).

| Context | Mode | Options |
|---------|------|---------|
| App (`(app)/layout.tsx`) | wrapper mode: `<ReactLenis>` without `root`, rendering the wrapper/content elements around the sheet's scroll region (`min-h-0 flex-1 overflow-y-auto` today) | `{ lerp: .12, duration: 1.1, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: true, autoResize: true }` |
| Marketing and long pages (`/design`, auth) | root mode: `<ReactLenis root>` on `<html>` | `{ lerp: .1, duration: 1.2, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: true }` |

Frame loop: one loop only. `autoRaf: false` and Lenis is driven from Motion's `frame.update((d) =>
lenisRef.current?.lenis?.raf(d.timestamp), true)`, cancelled with `cancelFrame` on unmount (research §5). No GSAP.
Motion's `useScroll` reads the real scroll position, so any scroll-linked effect stays correct.

`data-lenis-prevent` goes on every nested scroller: the command palette list, the voice picker listbox
(`role="listbox"`), radix DropdownMenu / Popover / Select contents, Dialog and AlertDialog bodies, the mobile drawer,
the sidebar "Chats" list, the section panel nav, every `textarea` (composer, "Your posts", "Paste your memories", the
import prompt), `pre` / code blocks on `/design`, and the Clerk card. Lenis is stopped while any dialog is open.

Reduced motion: `respectReducedMotion` stays at its default `true`, so smoothing turns off live when the OS preference
is set; `scrollTo` and anchors jump. The installed version's option name is confirmed in D2 before merge.

Native features that must keep working, each with a Playwright check: anchor links (`#id` scrolls and focuses),
sticky page header stays stuck inside the sheet, keyboard scrolling (Space, Page Up/Down, Home/End, arrows) with focus
in the content, find-in-page scrolls the match into view, `element.focus()` scrolls into view (tab through a long
memories page), the e2e `scrollIntoViewIfNeeded` on the content-mix chart still lands the hover.

Playwright assertions for `apps/web/e2e/scroll.spec.ts` (new in D2):

| Check | Assertion |
|-------|-----------|
| anchor links | click `a[href="#content-mix"]`; `expect(heading).toBeInViewport()` and the sheet's `scrollTop` changed |
| sticky header | scroll the sheet 600 px; the page header's bounding-box top equals the sheet's top |
| keyboard scroll | focus the content, press `PageDown`: sheet `scrollTop` grows by ≥ 50 % of `clientHeight`; `Space`, `End`, `Home`, `ArrowDown` likewise |
| focus scroll-into-view | Tab through 30 memory rows; every focused element `toBeInViewport()` |
| find-in-page proxy | `element.scrollIntoView()` on an off-screen row brings it into the viewport (what find-in-page uses); the real find bar is a manual item in the critic pass |
| nested scroller | with the command palette open, `mouse.wheel(0, 400)` over its list scrolls the list and the sheet's `scrollTop` is unchanged |
| reduced motion | with `reducedMotion: 'reduce'`, `mouse.wheel(0, 800)` moves the sheet's `scrollTop` by 800 within one frame (no lerp) |
| e2e parity | `strategy.spec.ts`: `scrollIntoViewIfNeeded()` then hover on the chart still adds `bg-surface-sunk` to the first legend row |

## 7. Reduced-motion matrix

| Category | Reduced-motion behaviour |
|----------|--------------------------|
| Presses (B1, B4) | instant translate / scale .96, no spring |
| Hovers (B2, B3, H1–H6) | state appears without motion; colour and plate changes remain |
| Entries and exits (stamp, routes, dialogs, toasts) | opacity only, same durations |
| Draws (S1, S3, S5, H3) | final frame |
| Loops (S4, S6, skeleton) | one static frame |
| Text (T1, T2) | final text, final number |
| Layout (R2, R3, R7, R8) | instant |
| Lenis | smoothing off, native scroll |

Verified by the Playwright run with `reducedMotion: 'reduce'`: no element reports a non-identity transform during
load and no `transform` transition is pending on hover.

## 8. Motion budget and the 60 fps check

Budget: in-app interactions ≤ 400 ms; home load orchestration ≤ 600 ms; only transform / opacity / filter (plus
`clip-path` in B3, checked); no `layout` animation on lists > 20 rows; at most one looping animation visible per
screen; `motion` imported through `LazyMotion` + `domAnimation`, `m.*` only; home route JS growth from motion work
≤ 40 KB gz (compare `next build` output before and after).

60 fps check (run on `/design`, Chrome, 1440 × 900 and 390 × 844, day and night, 4× CPU throttle):

1. Open DevTools → Performance, tick "Screenshots", set CPU 4× slowdown, start recording.
2. For each demo block, trigger the interaction three times (hover-leave, press-release, open-close, scroll a
   screenful with Lenis), then stop.
3. Pass criteria per interaction: no frame over 16.7 ms during the interaction window; no "Layout" or "Recalculate
   Style" task over 2 ms triggered by the animation (only "Composite Layers"); no `Animation` entry on a property
   other than transform / opacity / filter / clip-path (Rendering → "Layer borders" and the Animations panel confirm
   properties).
4. Record paint cost of the grain layer (Rendering → "Paint flashing"): the grain must not repaint on scroll; if it
   does, switch to the PNG tile.
5. Save the trace as `.superpowers/sdd/<plan>/perf/<block>-<viewport>-<theme>.json` and note any failure in the
   task's review notes with the frame time and the offending property.
