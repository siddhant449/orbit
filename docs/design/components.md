# Component provenance

Version 2, 2026-10-21 (Drafting table). Riso-era adaptations that were removed with the direction change are listed at the end so the licence trail stays complete. One row per component in `packages/ui` (and the shell pieces that are built on them).
"Source" is where the idea or starting code comes from; everything is re-skinned to the tokens in `riso-system.md` and
re-implemented where the licence or the stack requires it. Fill in the "Adaptation notes" and "Status" columns as D2–D4
land; a row stays "TBD in D2" until its source is fetched and read.

Licence rules for the whole table:

- **Originkit**: MIT repo, but component source is plan-licensed and some components are paid; the free key allows 10
  source fetches per day (shared with site copies, reset 00:00 UTC). Code is adapted, not redistributed verbatim; credit
  Originkit in this file. Fetched sources live in `.recon/originkit/` (gitignored).
- **21st.dev**: licence is per component (check each page); free tier is 2 copies a day. Re-implement rather than paste.
- **Motion Primitives**: MIT (`github.com/ibelick/motion-primitives`). Install via `npx motion-primitives@latest add`.
- **Animate UI**: licence not stated on the site; confirm in the repo before any code is copied. Until then use as a
  reference only.
- **radix-ui**, **cmdk**, **sonner**, **lucide-react**, **lenis**, **motion**: MIT. **sharp**: Apache-2.0.
  **@paper-design/shaders-react**: Apache-2.0 (keep LICENSE/NOTICE if redistributed).

| Component | Planned source | Licence note | Adaptation notes | Status |
|-----------|----------------|--------------|------------------|--------|
| Button (primary / generate plate) | Originkit `tactile-button` (cap-on-plate press); `dotted-offset-button` for the offset logic; both fetched to `.recon/originkit/` | Originkit plan-licensed; rewrite to our tokens, no verbatim redistribution | **Drafting table:** the idea taken is "a cap that slides onto a fixed base until flush"; nothing else. CSS only: the `button` is a static 2 px `--line-strong` plate, a `span` child is the graphite face and translates 2 px on `:active` / `data-pressed` (keyboard Space/Enter for 120 ms); `generate` is an alias of `primary`; no colour plates | built |
| Button (secondary, danger, ghost) | hand-built | — | **Drafting table:** hairline frames; `danger` is a `--signal` frame with `--signal-ink` text (status only). The radial ink soak (Originkit `radial-reveal-button` idea) was removed with the direction | built |
| Button (ghost) | hand-built | — | sunk fill on hover, no plate | D2 |
| IconButton | hand-built (Button `size="icon"`) | — | stamp press (B4), 44 px touch target via padding | D2 |
| Magnetic CTA (marketing only) | Motion Primitives `magnetic` (Originkit `magnetic-hover-button` is paid-gated, not fetchable) | MIT | pointer-only, disabled on touch and reduced motion; not in `packages/ui`, lives in `apps/marketing` later | deferred to Feature 12 |
| Input, Textarea, NativeSelect, Label, Hint, FieldError | hand-built (existing `field.tsx`) | — | `--line-strong` rest border, keyline on hover, `--focus` ring; `data-lenis-prevent` on textareas; add `FieldError` caption | D2 |
| Dialog, AlertDialog | radix Dialog / AlertDialog + Motion `AnimatePresence`; Motion Primitives `morphing-dialog` as the reference for the later card-to-sheet open | MIT | stamp in / opacity out; scrim `--ink` 40 % no blur; Lenis stop/start; body `data-lenis-prevent` | hand-built, D2 |
| Popover, DropdownMenu, Tooltip | radix + Motion | MIT | 2 px plate, stamp 120 ms from the popper origin, ink-bar item highlight (H1) | hand-built, D2 |
| Tabs | radix Tabs; Animate UI Tabs as a reference for the `layoutId` underline | radix MIT; Animate UI licence unconfirmed, reference only | underline plate in `--ink` via `layoutId="tab-underline"` | hand-built, D2 |
| Chip | hand-built | — | pill, two offset plates, plate swap (H4), selected = pink plate + `--on-pink` | D2 |
| Badge | hand-built | — | square, plate colours per ink meaning | D2 |
| Sheet (card) | hand-built | — | surface + keyline; `raised` and `clickable` variants; H2 plate slide | D2 |
| Skeleton (halftone) | hand-built; Originkit `halftone-pulse` is the idea only (WebGL, not used) | — | CSS dot grid + hard paper sweep band; static under reduced motion | D2 |
| EmptyState | hand-built SVGs (two plates + explicit overprint path, 4×4 Bayer `<pattern>`) | ours | drift 2 px on hover (S2); registration crosses in the corners | D2 (SVG set drawn in D2, reused in D4) |
| Construction grid, crosshair marks, ruler, dimension line | hand-built CSS (`drafting.css`) | ours | **Drafting table:** desk grid (`--grid-line`, 32 px), 11 px crosshairs at the desk corners and around framed figures, ruled margin with 32 px ticks, dimension lines with end ticks and a measured label that draw in from the left | built |
| Overprint | hand-built (§5.2 of the system) | — | flat (explicit overlap path) and live (solved opacities, multiply / screen) modes | D2 |
| Misregister (text) | hand-built (§5.3) | — | `aria-hidden` span copies; settle animation (T1 / S1) | D2 |
| Avatar / VoiceAvatar | hand-built | ours | **Drafting table:** graphite line monograms (hairline frame, CSS-generated initials in ink; preset voices vary the ring weight); photos replace the initials. No dither, no colour plates | built |
| Kbd | hand-built; Originkit `keycap-button` idea | — | 2 px plate keycap, press when the shortcut fires (P09) | D2 |
| Toast theme | Sonner | MIT | stamp-in (S7) via Sonner's `unstyled` + our classes; overprint tick icon; keep `position="bottom-right"` | D2 |
| Donut | hand-built (existing `content-mix.tsx` SVG) | — | segments pink / blue / overprint / ink / muted with 2 px paper gaps; draw-in (S3); legend hover keeps `bg-surface-sunk` for the e2e class check | D4 |
| Meter | hand-built | — | ink keyline bar, fill plate per ink meaning, draw-in | D4 |
| Link (SVG underline) | hand-built; technique from Motion `pathLength` docs | — | inline `<line>` with `vector-effect: non-scaling-stroke`; CSS underline fallback | D2 |
| Highlight | Originkit `text-colour-sweep` as the idea (fetched); re-implemented as a `scaleX` plate | plan-licensed, idea only | one phrase per screen | D2 |
| AnimatedNumber | Motion Primitives `animated-number` / `sliding-number` as reference | MIT | tabular numerals, final value in DOM, `aria-live` | D4 |
| Text reveal (greeting) | Motion Primitives `text-effect` as reference; Acquerello line-plate lesson | MIT | per-line ink plate wipe + misreg settle (T1); heading text stays intact for accessible name | D4 |
| SmoothScroll | `lenis/react` | MIT | **Done (R2★):** `packages/ui/src/scroll/smooth-scroll.tsx`, wrapper mode around the sheet's scroll region (`lerp .12`, `duration 1.1`, `autoRaf: false`), driven from Motion `frame.update` and cancelled on unmount; `data-lenis-prevent` on the palette list, drawer, dropdowns, textareas; `respectReducedMotion` default | built, R2★ |
| Route transition | — | — | **No page transitions: routes switch instantly (user decision 2026-10-21).** A React `<ViewTransition>` prototype (keyed by pathname for a true exit, live CSS print-in) was built, judged by the user and removed. After a route change focus moves to the new `h1` or `main` (`RouteFocus`, no animation) | removed, R2★ |
| KineticHeading (greeting) | hand-built; Motion Primitives `text-effect` as the idea | MIT, idea only | **Drafting table:** per-letter CSS stagger animating `font-weight` 300 → 700 and `letter-spacing` .06em → -.035em with opacity / translateY; one `aria-hidden` layer; `h1` keeps `aria-label="What are we writing today?"`; static under reduced motion. The width morph and the pink/blue copies were removed with the direction | built |
| LineArt (hero, empty states) | hand-built SVG | ours | **Drafting table:** `sheet`, `stack`, `compass` drawings in `currentColor`, every stroke `pathLength="1"` and drawn in by `stroke-dashoffset` on a CSS stagger; complete under reduced motion; `aria-hidden` | built |
| CountUp (strategy) | hand-built; Motion Primitives `animated-number` as the idea | MIT, idea only | **Drafting table:** rAF tween 420 ms, tabular numerals, final value immediately under reduced motion | built |
| DraftingCursor | — | — | **Removed (R2★):** a crosshair + readout cursor was built and deleted on the user's decision (2026-10-21); the native cursor is used everywhere | removed |
| Tab (home starters) | hand-built | ours | **Drafting table:** hairline face on a 1 px graphite plate that offsets on hover; rises in on a 50 ms stagger; label roll. The riso ticket (perforation, pink/blue plates, stamp) was removed | built |
| Reveal (scroll) | hand-built on Motion `whileInView` | MIT | **Done (R2★):** `packages/ui/src/scroll/reveal.tsx`; once, 420 ms, 40 ms sibling stagger; off on first-fold content and lists > 20 rows | built, R2★ |
| Command palette | cmdk + radix Dialog (existing) | MIT | overlay plate, ink-bar rows, keycap hints; Lebedev hover lesson | D3 |
| Profile menu, sidebar, rail, section panel, drawer, page header | existing shell components on the new primitives | — | per `riso-system.md` §9 | D3 |
| Logo mark | hand-built SVG (existing `logo.tsx`) | ours | draw-on (S1) on auth; static in app | D3 |
| Marketing hero dither | `@paper-design/shaders-react` `Dithering` on one canvas, or hand-written raw WebGL Bayer (Codrops guide) if the bundle check fails | Apache-2.0 / ours | `next/dynamic` `ssr:false`, poster PNG fallback, dpr ≤ 1.5 | deferred to Feature 12 |
| `/design` ASCII loader demo | hand-built Canvas 2D; Originkit `ascii-reveal` (fetched) as reference | plan-licensed, reference only | 15 fps, 96 px cells, one frame under reduced motion; dev page only | D1.3 |
| Knowledge thumbnails (dither) | hand-built server-side Bayer with `sharp`; Originkit `dither-reveal` (fetched, per-card WebGL not used) idea only | sharp Apache-2.0 | 1-bit halftone PNG on upload, `mask-image` in `--pink`, crossfade to original | Feature 1 Task 7+ on the new system |
| Label roll (nav rows, tabs) | Originkit `label-slide-button` (fetched) | plan-licensed; source imports `motion/react`, rewrite to our tokens | **Done (R2★, CSS):** the idea kept is "the label rolls up out of an `overflow: hidden` clip while an `aria-hidden` duplicate rolls in from below" (the source exposed both copies to screen readers; ours hides the duplicate). No arrow badge, no `useAnimate`; two stacked spans translated by CSS on hover / focus-visible, 200 ms `ease-ink`; reduced motion = instant colour swap | built, R2★ |
| Stamp-in confirm (publish, toast icon) | Originkit `wax-seal` (fetched) as the idea only; `three` not used | plan-licensed, idea only | CSS / SVG stamp press (P24): scale 1.15 to 1, slight rotate, expanding ink ring; static ring under reduced motion | candidate, not scheduled |
| Generation / route progress (hairline) | Originkit `hairline-loader` (fetched) | plan-licensed; rewrite | ink rule, registration-mark ticks, counter in the display face (P27); drive from real task state, `role="progressbar"`; compact top-of-page variant, full-viewport split reveal optional | candidate, not scheduled |
| Route curtain (tiles) | Originkit `tiles-loader` (fetched) | plan-licensed; rewrite | ink squares over paper in random order (P28); real progress instead of the fake curve; `role="progressbar"`; crossfade under reduced motion | candidate, not scheduled |
| Hero stipple word | Originkit `stipple-flow` (fetched) | plan-licensed; rewrite | ink stipple on paper, focus blob follows the pointer; visually hidden `<h1>` with the same text; one shared GL context | deferred to Feature 12 |

Not used (decided): Originkit `scrambletext`, `brush-reveal`, `text-dither` (paid-gated, not fetchable), `dither-burn`, `bayer-vortex` (canvas / WebGL backgrounds, no reduced-motion handling, not
needed once the hero uses one shared canvas), `encrypt-button` / 21st `scramble-hover` / `hyper-text` (scramble text
rejected for a writing product), Motion Primitives `spotlight`, `glow-effect`, `tilt`, `border-trail` (glow and lift are
slop), 21st `dithered-shader-background` (Three.js), Framer-marketplace ASCII/dither components (Framer-only, paid).

## Removed with the Drafting table direction (2026-10-21)

| Component | Source it adapted | Why it is gone |
|-----------|-------------------|----------------|
| DitherField (Canvas 2D two-ink Bayer field) | Originkit `dither-burn`, `bayer-vortex` (ideas only) | riso device; deleted with its tests, export and static tile |
| Misregistration copies (greeting, buttons, tickets) | plan | riso device |
| Grain tiles, overprint and `.misreg` recipes, halftone skeleton | plan | riso devices |
| Ticket plates (pink / blue), pink avatars and theme chips | plan | riso colour |
| Radial ink soak on secondary buttons | Originkit `radial-reveal-button` (idea) | replaced by a hairline frame with a sunk hover |
| DraftingCursor | Heron lesson, Originkit `axis-cursor` (not fetched) | user decision: native cursor |
| Route print (View Transition exit + CSS print-in) | React `ViewTransition` | user decision: no page transitions |
