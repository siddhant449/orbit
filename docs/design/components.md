# Component provenance

Version 1, 2026-10-21 (D1.2). One row per component in `packages/ui` (and the shell pieces that are built on them).
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
| Button (primary, generate, danger) | Originkit `tactile-button` (cap-on-plate press) with the offset logic of `dotted-offset-button`; both fetched to `.recon/originkit/` | Originkit plan-licensed; rewrite to our tokens, no verbatim redistribution | strip the dotted pattern; shadow is a `::before` plate in `--plate-shadow`; add the misregistration plates (B2); normalise to `motion/react`; keep existing `cva` variants API (`variant`, `size`, `asChild`) so call sites do not change; rename `primary` colour from jade to ink and add `generate` (blue) | hand-built from reference, D2 |
| Button (secondary, ink soak) | Originkit `radial-reveal-button` (fetched) | as above; source imports `framer-motion`, switch to `motion/react` | entry-side radial `clip-path` in ink; exit reverses from the leave side; reduced motion instant | hand-built from reference, D2 |
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
| Grain | hand-built (feTurbulence tile, §5.4 of the system) | — | data-URI tile; PNG fallback if paint cost shows; animated 3-seed variant for marketing only | D2 |
| Overprint | hand-built (§5.2 of the system) | — | flat (explicit overlap path) and live (solved opacities, multiply / screen) modes | D2 |
| Misregister (text) | hand-built (§5.3) | — | `aria-hidden` span copies; settle animation (T1 / S1) | D2 |
| Avatar | hand-built; preset monograms generated as SVG; uploaded photos dithered server-side with `sharp` + Atkinson; Originkit `dot-image-reveal` is the hover idea only | sharp Apache-2.0 | square 2 px radius; `mask-image` in `--pink`; H5 crossfade; initials fallback | D2 (monogram generator), D4 (upload path with Feature 1 Task 7+) |
| Kbd | hand-built; Originkit `keycap-button` idea | — | 2 px plate keycap, press when the shortcut fires (P09) | D2 |
| Toast theme | Sonner | MIT | stamp-in (S7) via Sonner's `unstyled` + our classes; overprint tick icon; keep `position="bottom-right"` | D2 |
| Donut | hand-built (existing `content-mix.tsx` SVG) | — | segments pink / blue / overprint / ink / muted with 2 px paper gaps; draw-in (S3); legend hover keeps `bg-surface-sunk` for the e2e class check | D4 |
| Meter | hand-built | — | ink keyline bar, fill plate per ink meaning, draw-in | D4 |
| Link (SVG underline) | hand-built; technique from Motion `pathLength` docs | — | inline `<line>` with `vector-effect: non-scaling-stroke`; CSS underline fallback | D2 |
| Highlight | Originkit `text-colour-sweep` as the idea (fetched); re-implemented as a `scaleX` plate | plan-licensed, idea only | one phrase per screen | D2 |
| AnimatedNumber | Motion Primitives `animated-number` / `sliding-number` as reference | MIT | tabular numerals, final value in DOM, `aria-live` | D4 |
| Text reveal (greeting) | Motion Primitives `text-effect` as reference; Acquerello line-plate lesson | MIT | per-line ink plate wipe + misreg settle (T1); heading text stays intact for accessible name | D4 |
| SmoothScroll | `lenis/react` | MIT | wrapper mode for the sheet, root mode for long pages; Motion frame sync; `respectReducedMotion` default | D2 |
| Route transition | Motion `AnimatePresence` in `app/(app)/template.tsx` | MIT | stamp in / opacity out | D3 |
| Command palette | cmdk + radix Dialog (existing) | MIT | overlay plate, ink-bar rows, keycap hints; Lebedev hover lesson | D3 |
| Profile menu, sidebar, rail, section panel, drawer, page header | existing shell components on the new primitives | — | per `riso-system.md` §9 | D3 |
| Logo mark | hand-built SVG (existing `logo.tsx`) | ours | draw-on (S1) on auth; static in app | D3 |
| Marketing hero dither | `@paper-design/shaders-react` `Dithering` on one canvas, or hand-written raw WebGL Bayer (Codrops guide) if the bundle check fails | Apache-2.0 / ours | `next/dynamic` `ssr:false`, poster PNG fallback, dpr ≤ 1.5 | deferred to Feature 12 |
| `/design` ASCII loader demo | hand-built Canvas 2D; Originkit `ascii-reveal` (fetched) as reference | plan-licensed, reference only | 15 fps, 96 px cells, one frame under reduced motion; dev page only | D1.3 |
| Knowledge thumbnails (dither) | hand-built server-side Bayer with `sharp`; Originkit `dither-reveal` (fetched, per-card WebGL not used) idea only | sharp Apache-2.0 | 1-bit halftone PNG on upload, `mask-image` in `--pink`, crossfade to original | Feature 1 Task 7+ on the new system |
| Label roll (nav CTA, marketing links) | Originkit `label-slide-button` (fetched) | plan-licensed; source imports `motion/react`, rewrite to our tokens | clipped label roll (P05), 2 px corners, ink fill with paper text; mark the duplicate label `aria-hidden`; drop the arrow badge; reduced motion = instant colour swap | candidate, not scheduled |
| Stamp-in confirm (publish, toast icon) | Originkit `wax-seal` (fetched) as the idea only; `three` not used | plan-licensed, idea only | CSS / SVG stamp press (P24): scale 1.15 to 1, slight rotate, expanding ink ring; static ring under reduced motion | candidate, not scheduled |
| Generation / route progress (hairline) | Originkit `hairline-loader` (fetched) | plan-licensed; rewrite | ink rule, registration-mark ticks, counter in the display face (P27); drive from real task state, `role="progressbar"`; compact top-of-page variant, full-viewport split reveal optional | candidate, not scheduled |
| Route curtain (tiles) | Originkit `tiles-loader` (fetched) | plan-licensed; rewrite | ink squares over paper in random order (P28); real progress instead of the fake curve; `role="progressbar"`; crossfade under reduced motion | candidate, not scheduled |
| Hero stipple word | Originkit `stipple-flow` (fetched) | plan-licensed; rewrite | ink stipple on paper, focus blob follows the pointer; visually hidden `<h1>` with the same text; one shared GL context | deferred to Feature 12 |

Not used (decided): Originkit `scrambletext`, `brush-reveal`, `text-dither` (paid-gated, not fetchable), `dither-burn`, `bayer-vortex` (canvas / WebGL backgrounds, no reduced-motion handling, not
needed once the hero uses one shared canvas), `encrypt-button` / 21st `scramble-hover` / `hyper-text` (scramble text
rejected for a writing product), Motion Primitives `spotlight`, `glow-effect`, `tilt`, `border-trail` (glow and lift are
slop), 21st `dithered-shader-background` (Three.js), Framer-marketplace ASCII/dither components (Framer-only, paid).
