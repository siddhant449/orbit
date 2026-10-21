> Superseded by docs/design/orbit/ on 2026-10-22.

# Interaction research (Riso Print)

Researched 2026-10-21. Scope: hover, button, SVG and text animation patterns, plus dither / halftone / ASCII. All
web content was treated as data. Nothing here is code to paste: each item says what it does and how to **adapt** it to
the riso tokens. Third-party source fetched from Originkit lives in `.recon/originkit/` (gitignored) for adaptation only.

General rules for every pattern below:

- Animate `transform` and `opacity` only (plus `clip-path` / `mask` where noted). No animated `box-shadow` blur,
  `width`, `height`, `top`, `left`. A hard offset shadow is animated by moving a shadow *element* with `transform`.
- Every motion has a `prefers-reduced-motion` fallback: drop to an instant state change or a 1-frame crossfade, keep
  the colour/shadow change as the feedback. In Motion use `<MotionConfig reducedMotion="user">` plus `useReducedMotion()`.
- Every hover has a matching `:focus-visible` state, and touch gets a `:active` press state instead of hover.
- Springs for press (stiffness about 500, damping about 30), eased tweens (180 to 260 ms, `cubic-bezier(.2,.7,.2,1)`)
  for hover, linear for loaders.

---

## 1. Originkit

### How it works (verified)

| Item | Finding |
|------|---------|
| What it is | A catalogue of 704 components (index returned by the API on 2026-10-21). All are authored for **Framer**; the server adapts them on request to plain React / Next.js / Vite with the Framer bindings removed. |
| Endpoint | MCP server over HTTP at `https://mcp.originkit.dev/vellumai`, JSON-RPC 2.0, protocol `2025-03-26`. Unauthenticated requests return 401 with a `WWW-Authenticate` hint. |
| Auth | `Authorization: Bearer <ORIGINKIT_API_KEY>` (key lives in `.env`; it was read at runtime by a script, never printed or written to any file). |
| Tools (actual, from `tools/list`) | `list_components({category?})`, `get_component({name, stack: framer|react|nextjs|vite, styling: css|tailwind|cssmodules, typescript, preset?, tweaks?})`, `search({query})`, `fetch({id})`. The README names `originkit_browse / originkit_get / originkit_setup` (that is the plugin wrapper); the raw server tools differ. |
| Plugin | `vellum-ai/originkit` (MIT repo): `assistant plugins install originkit`. Key goes in the plugin `config.json` (`{ "apiKey": "cmp_live_..." }`) or per session. |
| Limits | README: 10 source fetches per key per day, shared with website copies, reset at 00:00 UTC; browsing is unlimited. First key: 10 fetch calls (8 delivered, 2 rejected as paid); no refusal was recorded, the key was simply treated as spent. **Second key, same UTC day: 11 `get_component` calls (10 distinct names: 6 delivered, 4 rejected as paid, plus 1 repeat of an already-fetched name), every one answered HTTP 200 with no quota error.** Had the cap been per account, the 14 delivered fetches across both keys would have been refused, so the allowance is per key (or not enforced at 10). The second key itself never exceeded 10 delivered, so the per-key cap was not tested. Plan for 10 per key per day; a fresh key restores access to the free components. |
| Plan gating | Free plan returned: "`dither-effect-2` is a paid component and your plan does not include it", same for `scroll-text-highlight`. The second key hit the same wall on `scrambletext`, `brush-reveal`, `magnetic-hover-button` and `text-dither`; the rejection is a normal HTTP 200 response carrying the message and no source. Check `originkit.dev/pricing` before planning around a component. |
| Output shape | JSON with `dependencies`, an `installHint`, an `agentInstructions` brief (needs **Tailwind v4**; write into `src/components/originkit`; add to Tailwind `@source`), then a fenced TSX file. |
| Category counts | background-animation 253, interactive-elements 118, text 83, animation 78, image-gallery 46, image 43, loader 28, cursor 23, button 21, games 7, border 4. |
| Licence | The repo is MIT, but the README states no separate terms for the component source and the plan gates some components. **Treat the code as plan-licensed: adapt and rewrite to our tokens; do not redistribute verbatim**, and read `originkit.dev` terms before shipping anything unmodified. Credit is requested by the README. |
| Gotchas | Fetched code frequently has no `prefers-reduced-motion` handling (canvas / WebGL ones had none: see table). Some use `framer-motion` (old import) vs `motion/react`; normalise to `motion/react`. |

### Fetched into `.recon/originkit/` (14 components)

| File | What it does | Stack / deps | Reduced motion in source | Adaptation |
|------|--------------|--------------|--------------------------|------------|
| `dotted-offset-button.tsx` | button face translates on hover by an X/Y vector while a solid offset shadow sits behind it | `motion/react` (`useAnimate`, `useReducedMotion`), Tailwind; 461 lines | yes (4 refs) | closest thing to our **ink press**: strip the dotted pattern, set shadow = ink, press collapses shadow |
| `tactile-button.tsx` | cap slides onto a fixed base plate on press until flush, springs back | `motion/react`; 430 lines | yes (6) | use for primary CTA: cap = pink/ink face, base = offset ink plate |
| `radial-reveal-button.tsx` | hover fill wipes outward from the exact cursor-entry point | `framer-motion` (change to `motion/react`); 409 lines | yes (3) | **secondary button ink-soak**: fill colour = ink, radial clip from entry side |
| `text-colour-sweep.tsx` | per-letter sweep of an accent colour band through the text before it settles | `framer-motion`; 7 KB | no | **highlighter sweep** on headings; make the band a pink marker bar behind text |
| `dither-burn.tsx` | WebGL2 ribbon field through an ordered 4x4 Bayer dither; area near the pointer burns through | raw WebGL2, 18 KB, no deps | no | marketing hero background; recolour to two inks; gate behind reduced-motion static frame |
| `bayer-vortex.tsx` | Canvas 2D spiral field quantised through an 8x8 Bayer matrix | raw canvas, 363 lines | no | lightest dither background; good loader / empty-state animation at small size |
| `halftone-pulse.tsx` | WebGL point-sprite grid, dot size and opacity carry a radial sine wave | raw WebGL, 338 lines | no | halftone ripple behind a hero or "generating" state; pink dots on paper |
| `ascii-reveal.tsx` | turns any photo into live ASCII with a cursor-tracked porthole revealing the real image | Canvas 2D, 400 lines | no | marketing-only; static ASCII render on reduced motion |
| `label-slide-button.tsx` | pill button whose label rolls up out of an `overflow:hidden` clip while a duplicate rolls in from below; an arrow badge swaps in a second arrow and both change colour on pointer hover and `:focus-visible`; press scales to 0.97 | `motion/react` (`useAnimate`, `useReducedMotion`); inline styles, Tailwind not needed; 553 lines; meta lists `framer-motion` + `motion` | yes (`useReducedMotion` turns every transition into `duration: 0`; the colour and label swap still happen, instantly) | **P05 label roll** for the nav CTA: keep the clipped roll, square 2px corners, ink fill with paper text; mark the duplicate label `aria-hidden` (source exposes both copies to screen readers); drop or replace the arrow badge |
| `wax-seal.tsx` | procedurally baked 3D wax seal (height map from a logo mask, lobed irregular rim, optional rings) lit by a light that follows the cursor; presses in when scrolled into view and replays on re-entry | `three` (own `WebGLRenderer` per instance), 1131 lines; falls back to a remote logo URL when none is passed | no (reveal plays on viewport entry, cursor light always runs; only `role="img"` `aria-label="Wax seal"`) | idea only, do not ship `three`: build the **P24 stamp press** in CSS / SVG (face scales 1.15 to 1, slight rotate, expanding ink ring) for publish confirm and toasts; static ring under reduced motion |
| `tiles-loader.tsx` | full-viewport page preloader: grid of ink squares, each paper cover fades out in random order as progress (fake easing curve capped by real `document` / image / font load) rises under a huge `mix-blend-mode: difference` percentage; at 100% tiles scale to 0 diagonally; fades itself out and calls `onComplete` | no deps, React + rAF + inline styles; 360 lines; min size 1200x800; shares the `useEditorialLoader` hook with `hairline-loader`; default palette `#EEEAE3` / `#151412` is already paper and ink | partial (`matchMedia` shortens the load to 0.6 s and the reveal to 0.4 s but it still animates; no role or aria on the progress) | **P28 route curtain / generation progress**: keep tile logic, feed `progress` from real task state instead of the fake curve, add `role="progressbar"` with `aria-valuenow`, replace the serif counter with our display face; RM: crossfade |
| `hairline-loader.tsx` | full-viewport preloader: 1px rule draws left to right with tick marks every 10% and a large serif counter riding its head; at 100% the top and bottom halves split apart to reveal the page | no deps, same hook and 334 lines as `tiles-loader`; min size 1200x800 | partial (same as `tiles-loader`) | **P27 hairline loader**: ink rule, ticks as registration marks, counter in display face; compact version (rule + counter only) as a top-of-page progress for long generations; add `role="progressbar"`; split reveal optional |
| `dither-reveal.tsx` | image drawn by a WebGL shader as a 3-tone dither (Bayer 8x8, diagonal lines or noise) with an ambient moving wave; a soft circle around the pointer reveals the real photo | raw WebGL1, no deps, 424 lines; texture from the `image` prop (default is a remote Unsplash URL with `crossOrigin`); pointer events only | no (continuous wave unless `wave=false`; pauses off-screen via `IntersectionObserver`; no keyboard or touch path) | **P18**: never one WebGL context per card; pre-bake the dither with `sharp` and crossfade on hover, or use this shader for one hero image only; RM: wave off, static dither |
| `stipple-flow.tsx` | one huge word rendered to a canvas field, stippled by a WebGL threshold shader; a soft focus blob drifts on a Lissajous path lighting the letters, follows the pointer on hover and tightens on press | raw WebGL1 + 2D canvas, no deps, 778 lines; min size 1200x800; text exists only in the canvas | yes (`matchMedia` freezes the animation clock so the blob stops drifting; pointer-driven focus still works) | marketing hero word only (Feature 12): ink stipple on paper, focus follows the pointer; add a visually hidden `<h1>` with the same text; share one GL context with the hero background |

Other Originkit components worth a later fetch (not fetched, index metadata only): **text**: `text-gather`,
`focus-reveal`, `skew-in-text-effect`; **button**: `encrypt-button` (cipher scramble to label), `arrow-reveal-button`;
**image**: `dot-image-reveal`, `pixelreveal`, `sticker-peel`; **cursor**: `inkbleed-cursor`, `dot-cursor`,
`axis-cursor` (crosshair with X/Y readout, echoes the Heron drafting cursor); **background**: `pulsing-ripple`,
`tidal-stipple`, `triangle-halftone-dark`, `ascii-rain`, `ascii-flame`, `ascii-radar`.

Paid on the free plan, so not fetchable with these keys (rejected by the server, no source returned): `scrambletext`,
`brush-reveal`, `magnetic-hover-button`, `text-dither`, plus `dither-effect-2` and `scroll-text-highlight` from the first
batch. Use the Motion Primitives `magnetic` / `text-effect` references for the same patterns.

---

## 2. 21st.dev (free tier, browsed only, not logged in)

Install format for every component:
`npx shadcn@latest add "https://21st.dev/r/<author>/<slug>?api_key=$API_KEY_21ST"`; key from `21st.dev/mcp`; free accounts
have a daily install limit. Per-component markdown is at `https://21st.dev/@<author>/components/<slug>.md`. Full index at
`https://21st.dev/llms.txt`. Licences are per component: check each page.

| Component | URL | What it does | Fit (riso) | Licence seen |
|-----------|-----|--------------|-----------|--------------|
| Dither Effect (andrehzh) | https://21st.dev/@andrehzh/components/dither-effect.md | looping ASCII/dither flicker baked to video, zero-dependency | hero or card backdrop; swap video for 2-ink | MIT |
| DitheredShaderBackground (dhileepkumargm) | https://21st.dev/@dhileepkumargm/components/dithered-shader-background-1.md | Bayer-dither shader background (Three.js) | reference for a shared hero canvas | not shown |
| Hyper Text (dillionverma) | https://21st.dev/@dillionverma/components/hyper-text.md | letters scramble on hover then resolve | nav / link hover | MIT |
| Scramble Hover (danielpetho) | https://21st.dev/@danielpetho/components/scramble-hover.md | per-character scramble on hover | kbd shortcut labels, tag chips | MIT |
| Text Hover Effect (manuarora700) | https://21st.dev/@manuarora700/components/text-hover-effect.md | SVG outlined text with gradient following cursor | footer wordmark: swap gradient for plate offset | MIT |
| Text Hover Effect (moazamtrade) | https://21st.dev/@moazamtrade/components/text-hover-effect.md | SVG text with GSAP cursor mask | reference only (GSAP) | not shown |
| Button components, 200 listed | https://21st.dev/community/components/s/button | generic button set; page gave no hover detail | not obviously riso; skip in favour of Originkit offset-shadow buttons | varies |

Verdict: 21st.dev is a good source for **text hover** and **dither backgrounds**, weak for riso buttons. Use for
ideas and the single free Dither Effect; always re-skin and re-implement.

---

## 3. Motion Primitives and Animate UI

| Library | Facts | Licence / stack |
|---------|-------|-----------------|
| **Motion Primitives** (`motion-primitives.com`, `github.com/ibelick/motion-primitives`) | Install: `npx motion-primitives@latest add text-effect` (swap name). Needs `motion` and Tailwind; utility `cn` (clsx + tailwind-merge). | MIT, motion + Tailwind |
| **Animate UI** (`animate-ui.com`, `github.com/imskyleen/animate-ui`) | Install: `npx @animate-ui/cli@latest animate all`; also an agent skill `npx skills add imskyleen/animate-ui`. Drop-in animated variants of shadcn/ui primitives on Radix UI, Base UI, React Aria: Switch, Tabs, Accordion, Checkbox, Radio Group, Sliding Number, Icons, Toast, Progress. | Licence not stated on the site; check the repo before use |

Motion Primitives components worth adapting (doc path `motion-primitives.com/docs/<slug>`):

| Pattern | Slug | What it does | Riso adaptation | Perf / a11y |
|---------|------|--------------|-----------------|-------------|
| Text Effect | `text-effect` | per-char / per-word / per-line staggered reveal with presets (blur, fade, slide, scale) | headline reveal: replace blur with a clip-path wipe from an ink plate | opacity + transform; wrap in `aria-label` of full text, split spans `aria-hidden` |
| Text Scramble | `text-scramble` | characters scramble then resolve | numeric / mono labels | respect reduced motion: render final text immediately |
| Text Shimmer | `text-shimmer` | moving highlight through text (loading) | "drafting..." state: shimmer = ink band moving across mono text | background-position animation; replace by static pulse on reduced |
| Text Morph / Text Roll | `text-morph`, `text-roll` | letters morph or roll to new text | async button label change; counter digits | `aria-live="polite"` on the result |
| Animated Number / Sliding Number | `animated-number`, `sliding-number` | spring-tweened number or per-digit slot | score / post count; digit rolls look like print counters | final value in DOM text, not only in the animation |
| Border Trail | `border-trail` | a highlight travelling around a border | **do not use** glow; fine as a thin ink dash on the focused composer | stroke-dashoffset or offset-path; off on reduced |
| Magnetic | `magnetic` | element pulled toward cursor within a radius | marketing CTAs only (per plan) | pointer devices only; disable on touch and reduced motion |
| Morphing Dialog / Popover | `morphing-dialog`, `morphing-popover` | shared-layout open from trigger (`layoutId`) | card opens into the editor sheet | needs focus trap; Radix-based dialog underneath |
| Spotlight / Glow Effect | `spotlight`, `glow-effect` | cursor-following radial light / animated glow | **avoid** (glow = AI-slop); a halftone spotlight (dots grow near cursor) is the riso analogue | n/a |
| Tilt / Cursor / Dock | `tilt`, `cursor`, `dock` | 3D tilt, custom cursor, macOS dock | avoid tilt (soft lift); custom cursor limited to marketing | |
| Transition Panel / Animated Group / In View | `transition-panel`, `animated-group`, `in-view` | panel switching, staggered group entry, viewport trigger | route / tab transitions, list stagger | IntersectionObserver, once |

---

## 4. Codrops (tympanus.net/codrops)

Note: WebFetch returned 403 for Codrops articles, so these entries come from search listings (titles and summaries
only). Read the articles before implementing.

| Pattern | URL | What it does | Riso fit | Notes |
|---------|-----|--------------|----------|-------|
| Interactive WebGL Backgrounds: A Quick Guide to Bayer Dithering (Jul 2025) | https://tympanus.net/codrops/2025/07/30/interactive-webgl-backgrounds-a-quick-guide-to-bayer-dithering/ | 2x2 to 8x8 Bayer threshold in GLSL on a gradient, pointer interactive | hero background in two inks | single full-screen quad; cheap |
| Building a Real-Time Dithering Shader | https://tympanus.net/codrops/?p=95318 | 4x4 Bayer: luminance vs per-pixel matrix threshold | image dither at runtime (avatars, uploads) | needs WebGL context; prefer build-time for static |
| Efecto: Building Real-Time ASCII and Dithering Effects with WebGL Shaders (Jan 2026) | https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders | ASCII, dithering and halftone with print history, plus CRT extras | basis for our hero image treatment | skip the CRT scanline parts |
| Creating an ASCII Shader Using OGL (Nov 2024) | https://tympanus.net/codrops/2024/11/13/creating-an-ascii-shader-using-ogl/ | render to texture, second pass maps luminance to a glyph atlas | text-mode loader / transition | OGL is about 30 KB; lighter than Three.js |
| Beyond the Luminance Ramp: A Shape-Aware ASCII Renderer in Three.js (Sep 2026) | https://tympanus.net/codrops/2026/09/04/beyond-the-luminance-ramp-a-shape-aware-ascii-renderer-in-three-js/ | glyph chosen by shape match, not brightness, so edges stay sharp | high-fidelity ASCII hero art (build-time render preferred) | heavy; Three.js |
| Hover Animations for Terminal-like Typography | https://tympanus.net/codrops/tag/hover/ | monospace hover effects on lists | nav rows / library rows invert-bar variants | CSS or small JS |
| Grid items revealed with morphing SVG paths (anime.js) | search result, Codrops experiment | SVG path morph reveal for grid items | card reveal as a torn / printed edge | same-point-count paths, or flubber |
| SVG line drawing (Jake Archibald technique) | Codrops circular progress button article | `stroke-dasharray` + `dashoffset` draw | the same in Motion with `pathLength` (below) | |

---

## 5. Motion docs and Lenis: exact APIs

### Motion (`motion/react`)

| API | Use | Source |
|-----|-----|--------|
| `pathLength`, `pathOffset`, `pathSpacing` | each is a 0 to 1 progress value on `path`, `circle`, `ellipse`, `line`, `polygon`, `polyline`, `rect`; `<motion.path d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />` | https://motion.dev/docs/react-svg-animation |
| Path morph | animate the `d` attribute: `<motion.path d="M 0,0 l 0,10 l 10,10" animate={{ d: "M 0,0 l 10,0 l 10,10" }} />`. Works natively when both paths have the same number and type of commands; otherwise use a path mixer such as Flubber | same |
| `layout` | animates size/position changes from a React render; make the change via `style`/`className`, not animation props | https://motion.dev/docs/react-layout-animations |
| `layoutId` | shared element: the new element animates from the old one's box; crossfades if the original is still mounted | same |
| `LayoutGroup` | sync layout animation across siblings that do not re-render together | same |
| `AnimatePresence` | keeps a `layoutId` / exiting element mounted until its exit finishes | same |
| `layout="position"` | animate position only, snap size (images, text that changes aspect) | same |
| `layoutScroll`, `layoutRoot` | required on scrollable / fixed containers so measurements are right (relevant to the Lenis app card) | same |
| `transition={{ layout: { duration: .3 } }}` | transition for layout only | same |
| Scale distortion | add `layout` to children to counter-scale; set `borderRadius` and `boxShadow` through `style` so Motion corrects them | same |
| Limits | `display:inline` will not animate; layout animation blocked during horizontal window resize; **SVG elements are not supported by `layout`**, animate `cx`/`d` directly; use `scrollbar-gutter: stable` to avoid scrollbar-triggered layout shifts | same |
| Reduced motion | `<MotionConfig reducedMotion="user">` (disables transform and layout animation, keeps opacity) and `useReducedMotion()` | motion docs (from prior knowledge; confirm in `motion.dev/docs/react-accessibility`) |
| `useAnimate`, `frame`, `cancelFrame` | imperative sequences; `frame.update(fn, true)` registers a callback on Motion's frame loop | Originkit source and Lenis README |

### Lenis React (`lenis/react`, `github.com/darkroomengineering/lenis`)

| API | Detail | Source |
|-----|--------|--------|
| Install / CSS | `npm i lenis`; `import 'lenis/dist/lenis.css'` (recommended, required for `autoToggle`) | Lenis README |
| `<ReactLenis>` | props: `options` (Lenis instance settings), `root` (default `false`; `true` = global instance on `<html>`, available to `useLenis` anywhere; `'asChild'` = renders wrapper elements for a custom scroll container and is still global), `ref` (`LenisRef` type; `ref.current?.lenis`). Without `root` it renders its own wrapper and content elements, which is the mode for the app card | `packages/react` README |
| Wrapper / content | instance options `wrapper` (default `window`) and `content` (default `document.documentElement`, usually the wrapper's direct child). The React README does **not** document `className`, `wrapper` or `content` props: read `packages/react/src` when building the app-card mode | Lenis README + gap |
| `useLenis(callback, deps, priority)` | returns the instance; `callback` runs on every scroll event, `deps` re-registers, `priority` orders callbacks | `packages/react` README |
| `autoRaf` | instance option, default `false` in the core; set `options={{ autoRaf: false }}` and drive `lenis.raf(time)` yourself (below) | both READMEs |
| `data-lenis-prevent` | attribute on an element stops smoothing for it. Variants: `-wheel`, `-touch`, `-vertical`, `-horizontal`. Put on Radix popovers, dropdown lists, textareas and nested scroll areas | Lenis README |
| `respectReducedMotion` | **default `true`**: honours `prefers-reduced-motion: reduce` live; smoothing off (`lerp` forced to 1), programmatic `scrollTo` and anchors jump instantly, Lenis keeps running so WebGL/DOM sync still works; `lenis.prefersReducedMotion` is readable. Opt out with `false` (not recommended). Confirm the installed version has this option | Lenis README |
| Other options | `lerp` 0.1, `duration` 1.2, `smoothWheel` true, `syncTouch` false, `anchors`, `autoResize` true, `prevent(node)` function, `allowNestedScroll` (costly), `orientation`, `infinite` | Lenis README |

**Syncing with Motion's frame loop** (Lenis README pattern; no second rAF loop):

```tsx
const lenisRef = useRef<LenisRef>(null)
useEffect(() => {
  function update(data: { timestamp: number }) { lenisRef.current?.lenis?.raf(data.timestamp) }
  frame.update(update, true)
  return () => cancelFrame(update)
}, [])
// <ReactLenis root options={{ autoRaf: false }} ref={lenisRef} />
```

With `frame` / `cancelFrame` imported from `motion/react`. The README uses `cancelFrame` (not `cancelSync`). Motion's
`useScroll` reads the real scroll position, so scroll-linked animation stays correct while Lenis smooths the scroll.
Call `lenis.stop()` / `start()` while modals are open (and `data-lenis-prevent` on the modal body).

---

## 6. Pattern catalogue

Perf column assumes transform/opacity only. "RM" = reduced-motion fallback. Source = where the idea or code came from.

### 6.1 Buttons

| # | Pattern | What it does | Why / riso adaptation | Source | Perf / a11y / RM |
|---|---------|--------------|-----------------------|--------|------------------|
| P01 | Ink press | face sits 4px up-left of a solid ink plate; press translates the face onto the plate (shadow collapses), release springs back | the core riso interaction: a plate being pressed | Originkit `dotted-offset-button`, `tactile-button` | transforms only; RM: instant swap, keep colour change; `:active` for touch |
| P02 | Misregistered hover plates | on hover, the pink and blue plates behind the label shift 2px in opposite directions | prints out of register | plan + Gumroad shadow lesson | two pseudo-elements, `translate`; RM: no shift, underline instead |
| P03 | Ink-soak secondary | outline button fills with ink radially from the cursor's entry point | ink bleeding into paper | Originkit `radial-reveal-button` | `clip-path: circle()` or scaled circle; RM: instant fill |
| P04 | Magnetic CTA | pulls toward cursor within ~80px | marketing only | Motion Primitives `magnetic`; Originkit `magnetic-hover-button` | pointer only; disable touch + RM |
| P05 | Label roll | label rolls to a duplicate on hover | tactile feedback on nav CTA | Originkit `label-slide-button`; Motion Primitives `text-roll` | overflow hidden clip; RM: colour swap |
| P06 | Async morph | label shrinks to a halftone spinner, then a check, container `layout` animates width | feedback that is on-brand | Motion `layout`; Motion Primitives `text-morph` | `aria-busy`, announce result with `aria-live`; RM: static dots |
| P07 | Cipher label | label scrambles then resolves on hover | use only on "Generate" button | Originkit `encrypt-button`; 21st `scramble-hover` | RM: none; keep text stable for screen readers |
| P08 | Icon button stamp | rotate 6 degrees and scale 0.94 on press | stamped icon | plan | transform; RM: scale only |
| P09 | Keycap kbd hint | key chips depress when the shortcut is pressed | echoes Lebedev "PRESS ESC" hint | Lebedev lesson, Originkit `keycap-button` | purely visual; real key still works |

### 6.2 Hover (lists, cards, links, chips, avatars)

| # | Pattern | What it does | Riso adaptation | Source | Perf / a11y / RM |
|---|---------|--------------|-----------------|--------|------------------|
| P10 | Ink-bar row | hovered row inverts to an ink bar with paper text; an optional preview follows | highlighter on nav and library rows | Lebedev | background colour swap or scaleY bar; RM: same (no motion) |
| P11 | Highlighter sweep | marker bar draws left to right behind a word or heading | the "ink highlighter" | Originkit `text-colour-sweep`; PostHog marker | `scaleX` of a pseudo element with `transform-origin: left`; RM: bar visible, no sweep |
| P12 | Shadow plate slide-in | card hover slides a solid shadow plate in from a corner; no lift, no blur | misregistered shadow | plan | transform only; focus-visible mirror |
| P13 | SVG underline draw | link underline is an SVG stroke whose `pathLength` goes 0 to 1 | hand-drawn feel | Motion `pathLength` | `vector-effect: non-scaling-stroke`; RM: underline appears |
| P14 | Chip plate swap | chip's two colour plates swap places (pink on blue to blue on pink) | overprint flip | plan | two layers, transform; RM: colour swap |
| P15 | Halftone avatar hover | halftone dots in the avatar grow on hover to reveal the full-tone photo | dot radius via mask | Originkit `dot-image-reveal` (idea); Paper Shaders halftone | CSS mask on a pre-rendered halftone, no WebGL; RM: crossfade |
| P16 | Halftone spotlight | dots near the cursor grow | riso analogue of a glow spotlight | Motion Primitives `spotlight` (idea) | CSS variables updated in rAF; RM: static |
| P17 | Terminal row hover | mono rows with a block caret | library lists | Codrops terminal typography | CSS only |
| P18 | Image dither reveal | dithered image tears open to full colour at the pointer | knowledge-base thumbnails | Originkit `dither-reveal` (fetched; per-card WebGL is not used) | canvas / WebGL; RM: static dithered |
| P19 | Press feedback on touch | `:active` shifts the shadow plate | replaces hover | plan | CSS `:active` |

### 6.3 Custom SVG animation

| # | Pattern | What it does | Riso adaptation | Source | Perf / a11y / RM |
|---|---------|--------------|-----------------|--------|------------------|
| P20 | Logo mark draw-on | logo strokes draw with `pathLength`, then fill plates drop in offset | first-load moment | Motion `pathLength`; Overworld lesson | one SVG; once per session; RM: show final |
| P21 | Misregistration filter | an SVG `feOffset` per channel (pink, blue) with `feBlend multiply` on a heading | live overprint on text; animate offset by 1 to 2px | SVG filters (MDN) | filters repaint: apply only to one or two headings, never to lists; RM: static offset |
| P22 | Grain overlay | `feTurbulence` baseFrequency about 0.8 as a fixed pseudo-element, `mix-blend-mode: multiply` (day) / `screen` (night) | paper stock | Heron / Tie-break lesson | render once to a tiled PNG (96 to 192px) rather than live filter on full screen; `pointer-events: none`; `aria-hidden` |
| P23 | Path morph shapes | blob / star shapes morph between states (empty state to loading) | printed shapes | Motion `d` animation / Flubber | same command count; RM: no morph |
| P24 | Stamp-in toast | toast drops with scale 1.15 to 1, rotates slightly, plus an ink ring expanding | stamp press | Originkit `wax-seal` (idea); Sonner | transform; `role="status"`; RM: fade |
| P25 | Halftone skeleton | skeleton is a dot grid whose dots pulse in a diagonal wave | loader | Originkit `halftone-pulse` (idea) | CSS radial-gradient + `mask` animation; RM: static dots |
| P26 | Registration crosses | tiny crosses at section corners that draw on enter | structure as decoration | Heron | stroke draw; RM: visible |
| P27 | Hairline loader | a rule drawn across the top with percentage | page / route progress | Originkit `hairline-loader` | `scaleX`; `role="progressbar"` |
| P28 | Tiles ink-in loader | square tiles ink in one by one in random order | route transition curtain | Originkit `tiles-loader` | opacity on tiles; RM: crossfade |
| P29 | Layout tab underline | active tab plate slides between tabs with `layoutId` | tabs | Motion `layoutId` | transform; RM: instant |
| P30 | Folded corner | a card corner folds with a clipped triangle | print metaphor | Paper lesson | CSS clip-path static; no motion needed |

### 6.4 Text animation

| # | Pattern | What it does | Riso adaptation | Source | Perf / a11y / RM |
|---|---------|--------------|-----------------|--------|------------------|
| P31 | Plate wipe headline | each line is wiped in by an ink plate that slides away | line plates like Acquerello | Motion Primitives `text-effect`; Acquerello lesson | clip-path / transform; keep real text in DOM; RM: no wipe |
| P32 | Word overprint | one word is rendered twice (pink and blue) and the offset settles from 6px to 1px | misregistration landing | plan | transform on two spans; `aria-hidden` duplicate |
| P33 | Per-letter scramble | letters scramble then resolve | mono labels, counters | Motion Primitives `text-scramble`; 21st Hyper Text | RM: final text immediately; announce final text only |
| P34 | Scroll text highlight | words light up as you scroll | long manifesto paragraph | Originkit `scroll-text-highlight` (paid) | `useScroll` + opacity per word; RM: all words full |
| P35 | Shimmer drafting | mono "drafting..." text with a moving ink band | AI generating state | Motion Primitives `text-shimmer` | background-position; RM: static |
| P36 | Counter roll | digits roll like a print counter | stats, live "posts drafted" | Motion Primitives `sliding-number` | RM: instant number |
| P37 | Typewriter in composer | hero types a draft with chips (Attio lesson) | marketing hero | Originkit `type-sequence` idea | pause on hover; RM: show full draft |
| P38 | Variable-weight hover | letters change weight on hover | display grotesk wide axis | Originkit `weight-hover` | font-variation settings reflow: marketing only, never in lists |
| P39 | Ghost corner type | giant 8% ink type pinned to corners, slight parallax | scale without colour | bleibtgleich | transform; static on RM |
| P40 | Marquee | a ticker of words that syncs to scroll | footer / logos | Originkit `sync-scroll` | pause on hover and RM |

**40 patterns catalogued (P01 to P40)**, backed by the 14 fetched Originkit sources and the 21st.dev, Motion Primitives and Codrops tables above.

---

## 7. Dither, halftone and ASCII

### 7.1 Techniques and what they look like

| Technique | Look | Best for | Notes |
|-----------|------|----------|-------|
| Ordered / Bayer dither (2x2, 4x4, 8x8) | regular crosshatch grid | UI-scale art, gradients, backgrounds, loaders; stable under animation | patterned, no flicker when the picture moves; closest to "digital riso" |
| Error diffusion (Floyd-Steinberg, Atkinson) | organic stipple, noisy | portraits, photos (Sudowrite's faces) | slow for realtime; **flickers when animated**: use only on static pre-rendered images |
| Halftone dots (AM, rotated screens, CMY) | dots of varying size on a 45-degree grid | riso / newspaper print; hero images | classic print look; two-colour via one screen per ink at different angles (pink 15, blue 75 degrees) |
| Stipple | random dots of constant size | drawings (Heron) | pre-render; huge if SVG |
| 1-bit / two-colour threshold | pure ink vs paper | logos, avatars, empty-state illustrations | smallest files; themeable if used as a CSS mask |
| ASCII / glyph rasters | characters chosen by luminance (or shape match) | text-mode loaders, hero backgrounds, transitions | font matters; fixed-cell mono only |
| Dithered gradient | gradient quantised by a Bayer matrix | background washes without banding | CSS can approximate; shader is exact |

### 7.2 Implementation options and costs

| Option | How | Cost / bundle | Licence | Verdict |
|--------|-----|--------------|---------|---------|
| **Pre-processed at build time** | ImageMagick `magick in.jpg -colorspace Gray -ordered-dither h4x4a out.png` (halftone), `-ordered-dither o8x8` (Bayer), `-dither FloydSteinberg -remap` (diffusion); Node alternatives such as `sharp` for threshold plus a dither package (verify the package before choosing) | zero runtime; 1-bit PNG of an avatar is 1 to 3 KB | ImageMagick Apache-2.0 | **default for avatars, thumbnails, hero art** |
| **1-bit PNG as `mask-image`** | store a black-and-transparent PNG; `background: var(--ink-pink); mask: url(x.png) center/cover; image-rendering: pixelated` | zero JS; ink colour swaps with theme and per voice | n/a | best for two-ink avatars and day / night |
| **CSS patterns** | `background-image: radial-gradient(circle, var(--ink) 30%, transparent 31%); background-size: 6px 6px` for halftone; 2x2 / 4x4 Bayer as a tiled data-URI SVG or PNG; `background-blend-mode: multiply` for overprint | zero JS, tiny | n/a | halftone skeletons, section textures, spot-colour edges |
| **SVG filters** | `feTurbulence` for grain; `feComponentTransfer type="discrete"` to threshold a noisy gradient into 1-bit speckle (a noise dither, not true Bayer); `feColorMatrix` + `feComponentTransfer type="table"` as a duotone map | repaint cost grows with area; avoid on animated or large regions | n/a | grain overlay (prefer tiled PNG), duotone on small images |
| **Canvas 2D** | draw into a small canvas, `imageSmoothingEnabled=false`, scale with CSS | cheap at 64 to 256px; per-frame cost scales with cells | n/a | ASCII and Bayer loaders, empty states (Originkit `bayer-vortex`, `ascii-reveal` are Canvas 2D) |
| **WebGL shader** | one full-screen quad; Bayer threshold or halftone in the fragment shader | each context ~ms of setup and GPU memory; browsers cap live contexts (about 16): **never one per component**; use a single shared canvas or `OffscreenCanvas` | n/a | hero backgrounds only (Originkit `dither-burn`, `halftone-pulse`) |
| **Paper Shaders** `@paper-design/shaders-react` | ready-made WebGL2 shaders including image dithering, halftone dots, halftone CMYK, grain gradient, dithering, dot grid; zero dependencies | bundle size not published in the pages read: measure with `next build` analyzer before adopting; pin exact version (0.0.x breaking changes) | Apache-2.0 (commercial OK, no visible attribution; keep LICENSE/NOTICE if redistributing) | **best off-the-shelf option for the marketing hero** |
| Three.js / OGL render pipeline | as in the Codrops ASCII articles | Three.js is heavy; OGL ~30 KB | MIT | only if we already ship a 3D scene; otherwise use raw WebGL or Paper Shaders |
| Prebuilt widgets | 21st.dev Dither Effect (MIT, video-based), Framer marketplace ASCII / dither components (paid, Framer-only) | video weight; Framer ones not usable in Next | mixed | skip Framer ones |

### 7.3 Accessibility and performance rules

- All decorative dither / halftone / ASCII layers: `aria-hidden="true"`, `pointer-events: none`, no tab stops. A
  meaningful picture (avatar) keeps `alt` text; a canvas that conveys content needs `role="img"` and a label.
- **Contrast:** never put text directly on a dither or ASCII field. Use a solid paper or ink plate behind text
  (Acquerello line plates). Body text and dense data never sit over a pattern.
- **Motion:** animated dither shimmers at pixel scale; keep animation slow (under 3 flashes per second, WCAG 2.3.1) and
  low amplitude. Reduced motion renders one static frame (draw once, stop the rAF loop).
- **Performance:** pause rAF when offscreen (`IntersectionObserver`) and on `document.hidden`; cap dpr at 1 to 1.5
  for dither (the grain is the look); throttle ASCII to 15 to 24 fps; keep canvas at CSS size / 2 and scale up
  with `image-rendering: pixelated`; lazy-load shader code with `next/dynamic` (`ssr: false`) so it never blocks LCP; give
  the area a static fallback image (a pre-rendered dither) used while the shader loads.
- **Dark theme:** use `mix-blend-mode: screen` or swap the two inks; test both. Masks keep it easy.
- **Print metaphor discipline:** two inks only, fixed screen angles, one pattern scale per surface.

### 7.4 Where to use it in Brandloop (with restraint)

| Place | Treatment | Why | How | Skip when |
|-------|-----------|-----|-----|-----------|
| Creator-voice avatars and testimonials | 1-bit or two-ink dithered portraits (error diffusion, pre-rendered), plus halftone-grow hover (P15) | humanises voice profiles, matches Sudowrite's proof; avoids stock-photo feel | build-time script + `mask-image`; ink colour per voice | user-uploaded photos can fail: apply the same script on upload server-side, with a clean fallback to initials |
| Marketing hero art | stippled two-ink drawing, or a Paper Shaders dither / halftone background behind the composer demo | the one place for theatre | shared single canvas; static pre-render for RM and LCP | on mobile low-power (use the static image) |
| Skeleton loaders | halftone dot grid with a diagonal pulse (P25) | on-brand loader that replaces grey bars | CSS radial-gradient + mask animation | lists with more than about 20 rows (use plain ink bars) |
| Empty states | dithered two-ink illustrations (Bayer, 4x4) | warmth without cartoons | pre-rendered PNG masks | never for error states that need attention |
| Knowledge-base thumbnails | 1-bit halftone thumbnails that resolve to colour on hover (P18) | consistent look across arbitrary uploads | server-side processing on upload | the source is a diagram with text (loses legibility); show original |
| Route transition or "generating" loader | Bayer or ASCII loader, small (64 to 160px) | on-brand wait state | Canvas 2D | when under 400 ms (show nothing) |
| Hero headline accent | one dot-matrix word (Giga lesson) | typographic halftone | font or SVG | one per page maximum |
| Section edges / glows | grain-dissolved edge instead of blur (Raycast) | no gradients | tiled noise mask | always avoid blur glows |

**Where NOT to use it:** the editor / composer body text, dense tables and data, charts (use flat ink fills), forms
and inputs, small UI text, anything under 12px, error and destructive states, and any element a user must read
quickly. No ASCII for body copy. No error-diffusion on anything that animates.

### 7.5 Sources for this section

- Codrops: Bayer dithering guide, real-time dithering shader, Efecto (ASCII + dither + halftone), OGL ASCII shader,
  shape-aware ASCII renderer (links in section 4).
- Paper Shaders: `https://shaders.paper.design`, `https://github.com/paper-design/shaders`.
- 21st.dev: https://21st.dev/@andrehzh/components/dither-effect.md and the dithered shader background.
- Framer marketplace (reference only, paid and Framer-specific): ASCII Flow Trail, ASCII Motion, ASCII Cursor
  (interactive lens), Dither Media, Dither Grain Overlay (four modes: Bayer, fine noise, blue-noise grain, halftone).
- Originkit: `dither-burn`, `bayer-vortex`, `halftone-pulse`, `ascii-reveal`, `dither-reveal`, `stipple-flow` fetched;
  `text-dither` paid-gated; `tidal-stipple`, `ascii-*` backgrounds indexed.
- Awwwards Inspiration: "Dithered Images" by nahare (listing only; the creator's site did not load).
- Riso practice: a student riso blog (arts.ac.uk) calls dithering the riso machine's native algorithm; halftone
  frequency and screen angle guidance from Mint's riso guide; the Riso design skill (bergside) for palette:
  off-white, fluorescent pink, federal blue.
