# UI redesign (Riso Print) — D2–D4 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin every existing screen of the Brandloop app onto the Riso Print design system, with motion and smooth scrolling, while every feature, route, API and e2e spec stays exactly as it is.

**Architecture:**
- `packages/ui` becomes the single source of primitives: tokens, motion presets, riso devices, buttons, fields, overlays, avatars, the Lenis provider. Screens compose these and own no visual rules of their own.
- Motion goes through `motion/react` behind one `LazyMotion` provider (`m.*` only). Lenis runs in wrapper mode inside the app's sheet and in root mode on long pages, driven from Motion's frame loop.
- Every screen task ends with the same three gates: its existing e2e spec unchanged, an axe + 390 px + reduced-motion check, and a design-critic pass over day/night screenshots.

**Tech stack:** Next.js 16.4 (App Router, Turbopack), React 19, Tailwind v4, radix-ui, cmdk, sonner, lucide-react, `motion` (Framer Motion), `lenis`, next-themes, `@axe-core/playwright`, Vitest + Testing Library (new in `packages/ui`), Playwright.

**Spec:** `docs/design/riso-system.md` (tokens §2, type §3, grid §4, devices §5, states §6, inventory §8, shell §9, moments §10, slop §11, load-bearing copy §12), `docs/design/micro-interactions.md` (presets §0, B/H/S/T/R tables, Lenis §6, reduced-motion §7, budget §8), `docs/design/critic-rubric.md`, `docs/design/components.md`. Parent plan: `~/.claude/plans/immutable-snuggling-deer.md`.

## Global constraints

- **Feature parity.** No route, server action, API contract or service changes. `apps/web/e2e/{shell,memories,strategy,voice}.spec.ts` pass unchanged. The strings in `riso-system.md` §12 are kept byte-for-byte; a change needs the spec updated in the same commit with a reason in the ledger.
- **Tokens** are exactly `riso-system.md` §2.2 (day) and §2.3 (night). Headline values: paper `#F7F6F2`, surface `#FDFCF9`, ink `#16161D`, pink `#FF4F9A`, blue `#2B3FE0` (= `--accent`, `--focus`), overprint `#6B2C9E`, danger `#B4261E`; night paper `#121218`, ink `#ECEAE3`, pink `#FF6EB0`, blue `#6B7CFF`, overprint `#FFB5FF`. Night print is `.dark` (next-themes class). Pink is never text. In night print, text on every coloured plate is dark via the `--on-*` tokens.
- **Rename** `jade` → `accent`, `jade-ink` → `on-accent`, `jade-soft` → `accent-soft` everywhere in `apps/web` (one codemod commit in Task 1).
- **Type:** Archivo (`axes: ["wdth"]`, width 125 / 112 / 100 per §3.2) for display, Hanken Grotesk for everything else, no third family, **no monospace anywhere**; scale and 390 px clamps exactly as §3.2; `font-variant-numeric: tabular-nums` on captions, inputs, legends and ticking numbers.
- **Geometry:** base unit 4 px; `--radius-control: 2px` on everything except chips (`999px`); keylines 1 px; sheet inset 12 px on ≥ 768 px, full-bleed below; touch targets ≥ 44 px.
- **Devices** use only the recipes in §5 (keyline + hard offset shadow, overprint via `mix-blend-mode: multiply` with blue .70 / pink .84, misregistration 2–3 px, static SVG grain in-app, halftone skeleton, Bayer monogram avatars). No gradients, blur, glow, glassmorphism or `backdrop-filter`.
- **Motion:** import from `motion/react` through `LazyMotion` + `domAnimation`, `m.*` only; presets exactly `micro-interactions.md` §0; animate only `transform`, `opacity`, `filter` (plus `clip-path` in B3); in-app interactions ≤ 400 ms, home load ≤ 600 ms; no `layout` animation on lists > 20 rows; at most one looping animation visible per screen; `prefers-reduced-motion` behaviour per §7 for every interaction.
- **Lenis:** config per `micro-interactions.md` §6 (wrapper mode in the app, root mode on long pages, `autoRaf: false` driven from Motion `frame`, stopped while a dialog is open); `data-lenis-prevent` on every nested scroller listed there.
- **Budget:** home route First Load JS grows ≤ 40 KB gz from the pre-D2 baseline recorded in Task 1.
- **Accessibility:** axe serious/critical = 0 on every redesigned route; visible focus (`--focus` ring, 2 px paper halo on dark plates); hover-only affordances also appear on `:focus-visible`; `documentElement.scrollWidth <= innerWidth` at 390 px.
- **Dev page** `/design` is public only when `NODE_ENV !== "production"` and returns `notFound()` in production.
- **Repo rules:** TypeScript stays 5.9.3; never add `minimumReleaseAgeExclude` (pin an older version instead); DEEPGRAM stays disabled; never commit `.env`; commits end with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; sourced component code is adapted and recorded in `docs/design/components.md`, never pasted verbatim.
- **Out of scope here:** marketing site, dithering uploaded photos server-side (no photo source exists yet; lands with knowledge thumbnails), Feature 1 tasks 7–11 (resume after Task 13).

## Review focus

1. **A reduced-motion user opens the home page.** The greeting must be readable immediately with no transform applied and the page must be interactive within the same frame. Pinned by Task 9's `home.spec.ts` "reduced motion" test.
2. **A user switches to night print and reads a primary button.** Text on ink/blue/pink plates must be dark (`#121218` / `#16161D`), never white-on-blue. Pinned by Task 1's `design.spec.ts` night test on computed colours.
3. **A keyboard-only user deletes a memory line.** The delete control is hover-revealed; it must become visible and operable on focus. Pinned by Task 10's `memories.spec.ts` "keyboard reveals row actions" test.
4. **A user scrolls inside the command palette while Lenis smooths the sheet.** The list must scroll and the sheet must not. Pinned by Task 7's `scroll.spec.ts` "nested scroller" test.
5. **A 390 px phone shows the home greeting in Archivo 125.** The wide face must clamp and never widen the page. Pinned by Task 9's 390 px assertion on `scrollWidth` and the heading's bounding box.

---

### Task 1: Tokens, fonts, motion/Lenis dependencies, `/design` scaffold, test harness

**Files:**
- Modify: `packages/ui/src/tokens.css` (rewrite), `packages/ui/package.json`, `packages/ui/src/index.ts`
- Create: `packages/ui/src/motion/provider.tsx`, `packages/ui/src/motion/presets.ts`, `packages/ui/vitest.config.ts`, `packages/ui/src/test/setup.ts`, `packages/ui/src/motion/presets.test.ts`
- Modify: `apps/web/src/app/layout.tsx` (fonts, MotionProvider), `apps/web/src/app/globals.css` (import `lenis/dist/lenis.css`, `@custom-variant dark`), `apps/web/src/proxy.ts` (public `/design(.*)` outside production), `apps/web/package.json`, `apps/web/next.config.ts` (nothing new unless Turbopack needs it)
- Create: `apps/web/src/app/(dev)/design/page.tsx`, `apps/web/src/app/(dev)/design/sections/{palette,type,devices}.tsx`, `apps/web/e2e/helpers/shots.ts`, `apps/web/e2e/design.spec.ts`
- Codemod: every `jade` class/token in `apps/web/src/**` and `packages/ui/src/**` → `accent` family

**Interfaces:**
- Produces CSS custom properties with the exact names in §2.2/§2.3, exposed to Tailwind via `@theme inline` as `--color-<token>` (so `bg-paper`, `text-ink-muted`, `bg-stock-pink`, `text-on-ink`, `border-keyline` exist), plus `--radius-control: 2px`, `--shadow-raised`, `--shadow-sm`, `--font-display`, `--font-sans`.
- Produces the type scale as Tailwind utilities (`@utility`): `type-display-1`, `type-display-2`, `type-title-1`, `type-title-2`, `type-title-3`, `type-body`, `type-ui`, `type-caption`, `type-micro`, each setting family, weight, size, line-height, tracking, `font-stretch` (125 % / 112 % / 100 %) and the 390 px `clamp()` from §3.2; captions and micro set `tabular-nums`.
- Produces the icon convention from §7 in the base layer (lucide default `stroke-width` and the 16 / 20 px sizes as `icon-sm` / `icon-md` utilities).
- Produces `presets.ts`: `export const easeInk = [0.2, 0.7, 0.2, 1] as const`, `easeExit = [0.4, 0, 0.8, 0.4] as const`, `springPress = { type: "spring", stiffness: 500, damping: 30, mass: 1 }`, `springLayout = { type: "spring", stiffness: 380, damping: 36 }`, `durations = { hover: 0.2, entry: 0.18, exit: 0.12, draw: 0.4, settle: 0.24, loop: 1.2 }`, `stampVariants = { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0 } }`, and `useMotionSafe(): boolean` (true when motion is allowed; wraps `useReducedMotion`).
- Produces `MotionProvider({ children })` = `LazyMotion features={domAnimation} strict`.
- Produces e2e helpers: `captureSet(page, screen: string)` (saves `<screen>-{1440,390}-{day,night}.png` under `process.env.SHOTS_DIR` only when `SHOTS=1`, using `page.emulateMedia({ colorScheme })` for night), `axeCheck(page)` (fails on serious/critical), `expectNoHorizontalScroll(page)`.

- [ ] **Step 1: Record the bundle baseline before touching anything.** Run `pnpm --filter @brandloop/web build` at the task's starting commit and write the `/` route's "First Load JS" and the commit SHA to `docs/features/ui-redesign/bundle-baseline.md`. Task 13 compares against this number.
- [ ] **Step 2: Install dependencies** in `packages/ui`: `motion`, `lenis`; dev: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@types/react-dom`. In `apps/web`: `@axe-core/playwright` (dev). Pick versions that satisfy the release-age policy; never add an exclusion. Confirm `motion/react` exports `LazyMotion`, `domAnimation`, `m`, `useReducedMotion`, `frame`, `cancelFrame`, and `lenis/react` exports `ReactLenis`, `useLenis` (read `node_modules` types; note the installed versions in the report).
- [ ] **Step 3: Write the failing unit test** `presets.test.ts`: `springPress` equals the §0 object; `durations.entry === 0.18`; `useMotionSafe()` returns `false` when `matchMedia("(prefers-reduced-motion: reduce)").matches` is mocked true (render via a tiny test component).
- [ ] **Step 4: Run** `pnpm --filter @brandloop/ui test` → FAIL (module missing).
- [ ] **Step 5: Rewrite `tokens.css`** from §2.2/§2.3 (use the pasteable skeleton at `riso-system.md` line ~164 as the base), keep `:root` for day and `.dark` for night, add `@theme inline` mappings for every token, `--font-display: var(--font-display-face)`, `--font-sans: var(--font-ui)`, the type-scale and icon utilities above, base layer rules (body on paper with the static grain overlay from §5.4 as a fixed `::before`, focus ring, reduced-motion global clamp). Implement `presets.ts` and `provider.tsx`.
- [ ] **Step 6: Codemod** `jade` → `accent` across `apps/web/src` and `packages/ui/src` (`jade-ink`→`on-accent`, `jade-soft`→`accent-soft`, then `jade`→`accent`); run `pnpm --filter @brandloop/web typecheck lint`.
- [ ] **Step 7: Fonts and providers.** In `apps/web/src/app/layout.tsx`: `Archivo({ subsets:["latin"], axes:["wdth"], variable:"--font-display-face", display:"swap" })`, `Hanken_Grotesk({ subsets:["latin"], variable:"--font-ui", display:"swap" })`; wrap children in `MotionProvider`; set Clerk `appearance.variables` per §9 Auth row. Import `lenis/dist/lenis.css` in `globals.css`.
- [ ] **Step 8: `/design` scaffold.** `apps/web/src/app/(dev)/design/page.tsx` calls `notFound()` when `process.env.NODE_ENV === "production"`; renders a header, a day/night toggle (next-themes `useTheme`), and three sections: palette swatches (every token with its hex and role, text samples on every plate), the type scale (each §3.2 step rendered at its size with `font-stretch`), and device swatches (keyline+shadow plate, overprint demo, misregistration demo, grain tile, halftone skeleton — static CSS from §5, no components yet). Make `/design(.*)` public in `proxy.ts` when not production.
- [ ] **Step 9: Write `e2e/helpers/shots.ts` and `e2e/design.spec.ts`:** day: `getComputedStyle(html).getPropertyValue("--paper").trim() === "#F7F6F2"`; night (emulated dark): `--paper === "#121218"` and a `.text-on-blue` sample's computed `color` is `rgb(22, 22, 29)` (Review focus 2); the display-2 sample's computed `font-stretch` is `125%` and `font-family` starts with Archivo; `axeCheck`; `expectNoHorizontalScroll` at 390; `captureSet(page, "design")`.
- [ ] **Step 10: Run** unit tests (PASS), `pnpm --filter @brandloop/web lint typecheck`, the full existing e2e suite (`pnpm --filter @brandloop/web exec playwright test`) → all PASS unchanged, then `SHOTS=1 … e2e/design.spec.ts` → PASS with four PNGs. Build once more and append the post-task `/` First Load JS to `bundle-baseline.md`.
- [ ] **Step 11: Commit** `feat(ui): riso print tokens, fonts, motion provider, /design scaffold`.

### Task 2: Riso device components and motion primitives

**Files:**
- Create: `packages/ui/src/devices/{grain,overprint,misreg,highlight,halftone-loader,drawn-tick}.tsx`, `packages/ui/src/motion/stamp.tsx`, tests `packages/ui/src/devices/devices.test.tsx`
- Modify: `packages/ui/src/index.ts`; `apps/web/src/app/(dev)/design/sections/devices.tsx` (swap static swatches for the components, add a motion demo block)

**Interfaces:**
- `Grain({ animated?: boolean })` — fixed `aria-hidden` overlay; `animated` cycles three seeds at `steps(1)` 375 ms (S4), static under reduced motion. In-app usage is always static.
- `Overprint({ children, live?: boolean, offset?: 2 | 3 })` — renders pink and blue `aria-hidden` plates behind `children` (§5.2 opacities), `live` animates the settle 3× → 1× (P32, 240 ms `easeInk`).
- `Misreg({ children, dx?: number, dy?: number })` — §5.3 copies.
- `Highlight({ children })` — `--highlight` plate, `scaleX 0 → 1` on first viewport entry (H6, 320 ms), once.
- `HalftoneLoader({ size?: 24 | 36, label: string })` — 7×7 (or 3×3 at 24) dot grid, S6, `role="status"` with the label.
- `DrawnTick({ size?: number })` — S5 two-segment path, `pathLength` draw 260 ms in `--overprint`.
- `Stamp({ children, as?, delay? })` — `m.div` using `stampVariants`, 180 ms `easeInk`, opacity-only under reduced motion.

- [ ] **Step 1: Write failing tests** in `devices.test.tsx`: `Overprint` renders exactly two `aria-hidden="true"` plates and the child text once; `HalftoneLoader` exposes `role="status"` with its label and 49 dots at size 36; `DrawnTick` renders a `<path>` with `pathLength` attribute; `Grain` renders `aria-hidden` and `pointer-events: none`; under mocked reduced motion `Stamp` renders with `style.transform` unset/identity.
- [ ] **Step 2: Run** `pnpm --filter @brandloop/ui test` → FAIL.
- [ ] **Step 3: Implement** the six devices + `Stamp` using `m.*` and the presets; only transform/opacity/filter animate; every decorative element `aria-hidden`.
- [ ] **Step 4: Run** tests → PASS; `pnpm --filter @brandloop/web typecheck lint`; update the `/design` devices section with live demos and a "motion" block (stamp, settle, tick, loader).
- [ ] **Step 5: Commit** `feat(ui): riso devices and motion primitives`.

### Task 3: Buttons, IconButton, Kbd

**Files:**
- Rewrite: `packages/ui/src/button.tsx`; Create: `packages/ui/src/icon-button.tsx`, `packages/ui/src/kbd.tsx`, `packages/ui/src/async-button.tsx`, tests `packages/ui/src/button.test.tsx`
- Modify: `packages/ui/src/index.ts`; `/design` adds a "buttons" section (every variant × size × state, async demo)
- Adapt from `.recon/originkit/tactile-button.tsx`, `dotted-offset-button.tsx`, `radial-reveal-button.tsx` (ideas and offset math only; re-implemented, recorded in `components.md`)

**Interfaces:**
- `Button` props: `variant: "primary" | "generate" | "secondary" | "ghost" | "danger"` (default `primary`), `size: "sm" | "md" | "lg"` (32/36/44), `asChild`, native button props. Primary/generate/danger: ink (generate: blue) face on a static `--plate-shadow` plate offset 4 px, B1 press (`spring-press`), B2 misregistered hover plates (primary/generate only), 2 px radius, keyline. Secondary: B3 ink soak from the pointer-entry side (`clip-path: circle`), 220 ms. Ghost: sunk fill on hover. Keyboard: Space/Enter sets `data-pressed` for 120 ms.
- `IconButton` props: `label: string` (required, rendered sr-only + `aria-label`), `variant: "ghost" | "primary"`, `size: 32 | 36 | 44`; B4 stamp (`rotate 6deg`, `scale .94`); 44 px hit area via padding.
- `AsyncButton` props: `Button` props + `pending: boolean`, `done?: boolean`, `pendingLabel: string` (reduced-motion text), B5 morph: label fades, `layout` shrink to a 36 px square with `HalftoneLoader size={24}`, on `done` a `DrawnTick`, then grow back after 900 ms; `aria-busy` while pending.
- `Kbd({ children })` — keycap plate with 2 px shadow, caption size, P09 press on the matching keydown when `keys` prop is given (optional).
- Existing API kept: `Button` default export name, `buttonVariants` still exported (so Feature 1 code compiles).

- [ ] **Step 1: Write failing tests:** each variant renders its `data-variant`; primary renders two `aria-hidden` misreg plates and a shadow plate; secondary soak sets `--soak-x/--soak-y` CSS vars from `pointerenter` coordinates; keyboard Enter sets `data-pressed="true"` then clears; `AsyncButton pending` sets `aria-busy="true"` and renders `role="status"` with `pendingLabel`; under reduced motion `AsyncButton` shows `pendingLabel` text and no `HalftoneLoader` animation class; `IconButton` without `label` is a type error (compile-time; assert `aria-label` present in render).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per §6 state rules (hover/focus-visible/active/disabled/selected) and §5.1 elevation.
- [ ] **Step 4: Run** tests PASS; web typecheck/lint PASS (Feature 1 screens still compile against the kept API); `/design` buttons block; `SHOTS=1 … design.spec.ts` for critic.
- [ ] **Step 5: Critic gate** (controller): rubric sections A, B, C, E on the `/design` buttons block.
- [ ] **Step 6: Commit** `feat(ui): riso buttons`.

### Task 4: Fields, Sheet, Chip, Badge, Hairline, Skeleton, Avatar, EmptyState, Link

**Files:**
- Rewrite: `packages/ui/src/field.tsx` (Input, Textarea, NativeSelect, Label, Hint, FieldError); Create: `packages/ui/src/{sheet,chip,badge,hairline,skeleton,avatar,empty-state,link}.tsx`, `packages/ui/src/avatar/bayer.ts`, tests `packages/ui/src/primitives.test.tsx`
- Modify: `packages/ui/src/index.ts`; `/design` adds "fields", "surfaces", "avatars", "empty states"

**Interfaces:**
- Fields: `--line-strong` border at rest, keyline on hover, `--focus` ring, `aria-invalid` → danger border + `FieldError`; `Textarea` carries `data-lenis-prevent`.
- `Sheet({ variant: "flat" | "raised" | "clickable", as?, ...})` — surface + keyline (+ `--shadow-raised`); `clickable` adds the H2 plate slide (2 px) on hover/focus-visible.
- `Chip({ tone: "default" | "pink" | "blue", count?, selected? })` — pill, H4 plate swap; `Badge({ tone: "ink" | "pink" | "blue" | "overprint" | "danger" })` — square, 20 px.
- `Hairline({ strong?: boolean })`.
- `Skeleton({ kind: "text" | "block" | "avatar", width?, height? })` — §5.5 halftone with CSS sweep; static under reduced motion.
- `Avatar({ name: string, src?: string | null, size: 24 | 32 | 48 | 64, ring?: "none" | "overprint", seed?: string })` — square; with `src`: dithered mask layer + full-tone layer that fades in on hover (H5); without: **Bayer monogram** per §5.8: initials in Archivo on a 4×4 Bayer `<pattern>` of pink and blue plates, dominant plate chosen deterministically from `hashString(seed ?? name) % 2`, `aria-hidden` with the name in the owning control. `bayer.ts` exports `bayer4(): number[][]` and `hashString(s): number`.
- `EmptyState({ title, body, action?, variant: "default" | "placeholder", shape?: "a" | "b" | "c" })` — display-2 title, two-plate SVG (S2 settle on mount, drift on hover), `placeholder` adds the registration-cross frame (§5.7).
- `Link({ asChild?, children, ...anchorProps })` — a styled `<a>` (or the child via Slot when `asChild`, so `apps/web` passes `<NextLink>`) with the inline SVG underline draw (H3) in `--blue`; CSS `text-decoration` fallback under reduced motion.
- `Chip` and `Badge` forward native props (`role`, `aria-checked`, `onClick`) so Task 8 can render theme chips as radios.

- [ ] **Step 1: Write failing tests:** `Avatar` without `src` renders an `<svg>` with a `<pattern>` and the initials "PR" for "Priya Raman"; the same `name` always yields the same dominant plate (`data-plate`); `Avatar` with `src` renders two layers, the photo layer `aria-hidden`; `Skeleton` is `aria-hidden` and has `role` none; `EmptyState variant="placeholder"` renders four registration crosses; `Sheet variant="clickable"` renders the plate element; `Textarea` has `data-lenis-prevent`; `Input aria-invalid` renders `FieldError` text when `error` is passed.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** PASS; web typecheck/lint; `/design` sections; shots.
- [ ] **Step 5: Critic gate** on the new `/design` sections (A, B, C).
- [ ] **Step 6: Commit** `feat(ui): fields, sheets, chips, avatars, empty states`.

### Task 5: Overlays — Dialog, AlertDialog, Popover, DropdownMenu, Tooltip, Tabs, Toast theme

**Files:**
- Create: `packages/ui/src/overlay/{dialog,alert-dialog,popover,dropdown-menu,tooltip,tabs}.tsx`, `packages/ui/src/toast.tsx` (Sonner `Toaster` preset + `toastIcons`), tests `packages/ui/src/overlay/overlay.test.tsx`
- Modify: `packages/ui/src/index.ts`; `/design` adds "overlays" (open each; toast buttons)

**Interfaces:**
- Thin wrappers over radix (`radix-ui` package) with the same subcomponent names as radix (`Dialog.Root/Trigger/Content/Title/Description/Close`, etc.) so call sites keep their structure. `Content` renders through `AnimatePresence` + `m.*` with R5/R6 (stamp 180 ms in, 120 ms opacity out; menus/popovers stamp 120 ms from the popper origin via `--radix-*-transform-origin`), plate styling (surface, keyline, `--shadow-overlay`, ink 40 % scrim), `data-lenis-prevent` on every `Content`, and a `useLenisPause()` hook call that stops Lenis while open (hook defined in Task 6; until then a no-op stub exported from `packages/ui/src/scroll/pause.ts`).
- `Tabs` — radix Tabs with a `layoutId` underline plate in `--ink` (R8).
- `Toaster` — Sonner `unstyled` with our classes: plate + keyline + `--shadow-raised`, S7 stamp-in via CSS keyframes (`scale 1.12→1`, `rotate -1.5deg→0`, 180 ms) and the overprint ring; reduced motion → opacity only; icons: `DrawnTick` for success, danger glyph for error. Exported `toast` re-export unchanged.
- Dropdown/menu item highlight uses the H1 ink-bar (`data-highlighted` → ink plate `scaleX` sweep, text `--on-ink`).

- [ ] **Step 1: Write failing tests:** `Dialog.Content` has `data-lenis-prevent`; opening sets focus inside and `Escape` closes (radix behaviour retained); `DropdownMenu.Item` gets `data-highlighted` on hover and contains the sweep plate; `Tabs` renders one underline element that moves (`layoutId` present); `Toaster` renders with `data-sonner-toaster`.
- [ ] **Step 2–4:** FAIL → implement → PASS; web typecheck/lint; `/design` overlays; shots; verify no `backdrop-filter` anywhere (`grep -r backdrop packages/ui apps/web/src` returns nothing).
- [ ] **Step 5: Critic gate** on overlays (A, B, C, E).
- [ ] **Step 6: Commit** `feat(ui): overlays, tabs and toast on the riso system`.

### Task 6: SmoothScroll (Lenis) provider

**Files:**
- Create: `packages/ui/src/scroll/smooth-scroll.tsx`, `packages/ui/src/scroll/pause.ts` (replace the stub), `packages/ui/src/scroll/use-lenis-frame.ts`, test `packages/ui/src/scroll/smooth-scroll.test.tsx`
- Modify: `packages/ui/src/index.ts`; `/design` wraps its page in root mode and shows a scroll demo with an anchor link and a nested scroller

**Interfaces:**
- `SmoothScroll({ mode: "root" | "wrapper", children, className? })` — `ReactLenis` with `root` only in root mode; options per `micro-interactions.md` §6 table (`lerp .12 / duration 1.1` wrapper, `lerp .1 / duration 1.2` root, `smoothWheel: true`, `syncTouch: false`, `autoRaf: false`, `anchors: true`, `autoResize: true`); drives `lenis.raf(timestamp)` from Motion `frame.update(..., true)` and cancels on unmount; `respectReducedMotion` left at default (confirm the installed option name and note it in the report).
- `useLenisPause(active: boolean)` — calls `lenis.stop()` while `active`, `lenis.start()` after; used by Task 5 overlays.
- In wrapper mode the component renders the wrapper element with `className` and the content element inside it; it must accept the existing sheet classes (`min-h-0 flex-1 overflow-y-auto`) and expose `data-lenis-wrapper` for tests.

- [ ] **Step 1: Write failing tests** (jsdom, Lenis mocked at module level): wrapper mode renders `data-lenis-wrapper` and the children; `frame.update` is registered once and `cancelFrame` called on unmount; `useLenisPause(true)` calls `stop` and `start` on flip.
- [ ] **Step 2–4:** FAIL → implement → PASS; typecheck/lint; `/design` root mode + demo.
- [ ] **Step 5: Commit** `feat(ui): lenis smooth scroll provider`.

### Task 7: Shell chrome — sidebar, rail, section panel, drawer, page header, route stamp, Lenis wiring

**Files:**
- Modify: `apps/web/src/components/shell/{app-shell,sidebar,nav-link,logo,avatar}.tsx`, `apps/web/src/components/page.tsx`, `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/template.tsx` (R1 entry stamp; App Router templates cannot run exit animations — entry only, recorded), `apps/web/e2e/scroll.spec.ts`
- `shell/avatar.tsx` becomes a re-export of `@brandloop/ui` `Avatar` (keeps imports working)

**Interfaces (what stays):** `nav[aria-label="Main"]`, link names, `Open navigation` / `Close navigation`, `Search (Ctrl K)`, `Collapse sidebar` / `Expand sidebar`, `Brandloop home`, Ctrl+K and Ctrl+B handlers, the `sectionFor()` logic and `lib/nav.ts` data.

- [ ] **Step 1: Write `scroll.spec.ts`** with the eight assertions from `micro-interactions.md` §6 (anchor, sticky header, keyboard scroll, focus scroll-into-view, scrollIntoView proxy, nested scroller = Review focus 4, reduced motion, e2e parity hover) against `/settings/memories` (seed ≥ 30 lines through the UI inside the spec or reuse the existing memories flow) and `/strategy`.
- [ ] **Step 2: Run** it → FAIL (no Lenis wrapper yet; sticky header not yet inside the sheet).
- [ ] **Step 3: Rebuild the shell** per §9: desk on paper + static `Grain`; sheet = `Sheet variant="raised"` inset 12 px with `SmoothScroll mode="wrapper"` as its scroll region; sidebar 248 / rail 56 / section panel 228 with H1 ink-bar rows (`NavLink` → `m` plate `scaleX`), caption group labels in sentence case; page header per §9 (sticky, opaque, keyline rule before the title); drawer slides by transform (R4) with keyline right edge; collapse/expand use R2 width spring; section panel R3; `template.tsx` with `Stamp`; sidebar logo static; `data-lenis-prevent` on the Chats list, section panel nav, drawer.
- [ ] **Step 4: Run** `shell.spec.ts` + `scroll.spec.ts` → PASS; axe on `/`, `/settings/memories`, `/strategy`; 390 no-scroll; `SHOTS=1` captures `shell` (home with sidebar), `shell-section` (`/settings/memories`), `shell-drawer` (390, drawer open).
- [ ] **Step 5: Critic gate** (full rubric A–E).
- [ ] **Step 6: Commit** `feat(web): riso shell chrome and smooth scrolling`.

### Task 8: Command palette, profile menu, auth pages, Clerk appearance

**Files:**
- Modify: `apps/web/src/components/shell/{command-palette,profile-menu,add-profile-dialog,logo}.tsx`, `apps/web/src/app/(auth)/layout.tsx`, `apps/web/src/app/layout.tsx` (Clerk appearance already set in Task 1; verify), `apps/web/src/app/(app)/settings/team/page.tsx` only if it imports the old Avatar shape

**Interfaces (what stays):** placeholder `Search pages and profiles…`, `Profile menu` button containing the profile name, `Add profile`, theme radiogroup `Theme` with `Light`/`Dark`/`System`, `Sign out`, toasts `Switched to {name}`, dialog label `Profile name`.

- [ ] **Step 1: Keep `shell.spec.ts` as the test** (palette: Ctrl+K, type "templates", Enter navigates; profile: add + switch). Add two assertions to a new `shell-chrome.spec.ts`: palette rows show a `Kbd` hint for "New chat" (`⌘J` text or `Ctrl J`); the theme chips expose `role="radio"` with `aria-checked`.
- [ ] **Step 2: Run** → the two new assertions FAIL.
- [ ] **Step 3: Rebuild:** palette = overlay plate 560, input h 48, groups with caption headings, items h 36 with H1 ink-bar on `data-selected`, `Kbd` hints, list `data-lenis-prevent`; profile menu = `DropdownMenu` from Task 5 (plate 256, caption team name, `Avatar` rows, theme chips as `Chip` radios); add-profile = Task 5 `Dialog`; auth layout = paper desk, wordmark display-1 with 3 px `Misreg`, logo S1 draw once per session (`sessionStorage`), Clerk card as plain plate with the §9 `appearance.variables`.
- [ ] **Step 4: Run** `shell.spec.ts`, `shell-chrome.spec.ts` → PASS; axe on `/sign-in` and `/` with the palette open; shots `palette`, `profile-menu`, `auth` (day/night, 1440/390), plus a 1-second frame strip of the logo draw and a reduced-motion still.
- [ ] **Step 5: Critic gate** (A–E).
- [ ] **Step 6: Commit** `feat(web): command palette, profile menu and auth on the riso system`.

### Task 9: Home composer and placeholder pages

**Files:**
- Modify: `apps/web/src/components/home/composer.tsx`, `apps/web/src/components/page.tsx` (`Upcoming` → `EmptyState variant="placeholder"` with the existing copy), `apps/web/src/app/(app)/page.tsx` only if props change
- Create: `apps/web/e2e/home.spec.ts`

**Interfaces (what stays):** heading text `What are we writing today?` as one accessible name (copies `aria-hidden`), greeting line, textarea placeholder, `Attach a file` / `Dictate` / `Send` labels, the five starter chips' labels, the "Chat isn't connected yet" toast, placeholder pages' titles/description/bullets.

- [ ] **Step 1: Write `home.spec.ts`:** heading accessible name exact; T1 completes ≤ 600 ms (poll until the `h1` has no running animations via `getAnimations()` and the final opacity 1, assert elapsed ≤ 600 ms from navigation commit); with `reducedMotion: 'reduce'` the heading's computed `transform` is `none` and `opacity` 1 within 100 ms (Review focus 1); at 390 the heading's bounding box right edge ≤ viewport width and `scrollWidth <= innerWidth` (Review focus 5); Send is the only element with computed background `rgb(43, 63, 224)`; `/posts` placeholder renders four registration crosses and its title; axe; shots `home`, `placeholder`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Rebuild** per §10 Home: greeting T1 (per-line ink plate wipe + pink/blue copies settle, once per session), composer as raised `Sheet`, textarea `data-lenis-prevent`, `IconButton`s (B4), Send = `generate` variant, starter chips = `Chip` (H4), no other load motion; `Upcoming` → `EmptyState placeholder` keeping the copy. **Step 4: Run** PASS.
- [ ] **Step 5: Critic gate** (A–E; this screen's moment is the hero — one GIF).
- [ ] **Step 6: Commit** `feat(web): home composer and placeholder pages`.

### Task 10: Memories screen

**Files:**
- Modify: `apps/web/src/components/memories/{memory-card,add-memory,import-dialog}.tsx`, `apps/web/src/app/(app)/settings/memories/page.tsx`
- Modify: `apps/web/e2e/memories.spec.ts` — **append only** (new test, no changes to existing ones)

**Interfaces (what stays):** every §12 memories string; the server actions and their `expectedText` guard; `MemoryDoc.source` drives the tab colour: `USER` → pink, `EXTRACTED`/`IMPORTED` → blue, `MIRRORED` → overprint.

- [ ] **Step 1: Append to `memories.spec.ts`** "keyboard reveals row actions": add a line, then from the page top press `Tab` until the `Delete: {text}` button is focused; `expect(button).toBeVisible()` and its computed `opacity` is `1` (Review focus 3); also assert the line's source tab has `data-source="USER"`.
- [ ] **Step 2: Run** → the new test FAILS. **Step 3: Rebuild** per §10 Memories: cards as flat `Sheet`s separated by rules (not nested cards), 6 px source tab on each line, two-plate `EmptyState` inside empty groups, H2 plate slide on rows, row actions visible on `:focus-within`, `AsyncButton` for Add memory, import dialog on Task 5 `Dialog` with `Textarea` (`data-lenis-prevent`), toasts unchanged; line add/remove uses R7 (`AnimatePresence` + `layout`, `spring-layout`) only while a group has ≤ 20 lines, otherwise instant. **Step 4: Run** the whole `memories.spec.ts` → PASS; axe; 390; shots `memories`, `memories-empty` (a fresh profile created in the spec or the empty-group state).
- [ ] **Step 5: Critic gate.** **Step 6: Commit** `feat(web): memories on the riso system`.

### Task 11: Strategy screen

**Files:**
- Create: `packages/ui/src/charts/{donut,meter}.tsx`, test `packages/ui/src/charts/charts.test.tsx` (the §8 inventory places Donut and Meter in `packages/ui`; the apps/web components become thin wrappers that keep their testids)
- Modify: `apps/web/src/components/strategy/{foundation,content-mix,audience-balance,formats-cadence,series,generate-button,edit}.tsx`, `apps/web/src/app/(app)/strategy/page.tsx`
- Modify: `apps/web/e2e/strategy.spec.ts` — append only

**Interfaces:**
- `Donut({ segments: { id: string; label: string; percent: number; tone: "pink" | "blue" | "overprint" | "ink" | "ink-muted" }[], size: 160 | 200, highlightedId?: string, onHighlight?(id: string | null): void, centerLabel?: string })` — SVG ring with 2 px paper gaps, S3 draw-in on first viewport entry (80 ms stagger, ≤ 400 ms), segments focusable (`role="img"` with "Label, N%"); the SVG group keeps `aria-label="Content mix chart"` when the wrapper passes it.
- `Meter({ percent: number, tone, label: string })` — `role="meter"` bar with ink keyline and S3 fill draw.
- Unit tests: five segments render five `<path>` segments plus five gap paths; `percent` 0 renders no gap for that segment; reduced motion renders `pathLength` complete on mount.

**Interfaces (what stays):** headings `Strategy foundation`, `Content mix`, `Audience balance`, `Formats and cadence`, `Recurring series`; testids `mix-percent`, `mix-row`; the `bg-surface-sunk` class on the highlighted legend row (keep the class name even though the token moved); group `Content mix chart`; `Edit tagline` / `tagline`; `Educational percent`; `Regenerate strategy` + the AlertDialog body text; `Strategy saved`; the optimistic save queue in `edit.tsx` untouched.

- [ ] **Step 1: Append to `strategy.spec.ts`:** segments draw in — the first `<path>` in `Content mix chart` reaches `stroke-dashoffset`/`pathLength` final state within 400 ms of entering the viewport, and each adjacent segment pair is separated by a 2 px paper gap (assert `stroke="#F7F6F2"` gap paths or `data-gap` elements count = segments); the legend percentages render with `font-variant-numeric: tabular-nums`; under reduced motion the paths are complete on first paint.
- [ ] **Step 2: Run** → FAIL. **Step 3: Rebuild** per §10 Strategy: sections as rules not cards, donut segments in pink / blue / overprint / ink / ink-muted with S3 draw-in and T2 number tick, meters S3, inline edits on the system fields, `AsyncButton` for saves, `generate-button` → Task 5 `AlertDialog` + `HalftoneLoader` while polling. **Step 4: Run** full `strategy.spec.ts` → PASS; axe; 390; shots `strategy`, `strategy-empty`.
- [ ] **Step 5: Critic gate.** **Step 6: Commit** `feat(web): strategy on the riso system`.

### Task 12: Writing-style picker and settings screens

**Files:**
- Modify: `apps/web/src/components/home/voice-picker.tsx`, `apps/web/src/components/settings/{account-settings-form,profile-list}.tsx`, `apps/web/src/app/(app)/settings/{page,team/page}.tsx`
- Modify: `apps/web/e2e/voice.spec.ts` — append only

**Interfaces (what stays):** `Change writing style`, combobox `Search writing styles`, `Selected writing style` group, option names (all nine presets), `Add your style`, `Your posts` / `Learn my style` / `Paste at least 3 posts of 200+ characters`, toast `Writing style: {name}`; settings labels `Timezone`, `Save changes`, `Settings saved`, `Delete {name}` / `Delete profile` / `Deleted {name}`.

- [ ] **Step 1: Append to `voice.spec.ts`:** each preset option contains an `<svg>` monogram with a `<pattern>` (nine); the selected option's row has `data-selected="true"` and its avatar `data-ring="overprint"`; the listbox has `data-lenis-prevent`. Create `settings.spec.ts`: after clicking `Save changes` the button has `aria-busy="true"` and then the `Settings saved` toast appears; profile rows show square avatars (computed `border-radius` `2px`); deleting a profile row animates out with R7 and the remaining rows keep their names in order.
- [ ] **Step 2: Run** → FAIL. **Step 3: Rebuild:** picker on Task 5 `Popover`, `Avatar` monograms (seed = preset slug), selected row on `stock-pink` with overprint ring, H2 on rows, H5 n/a (no photos); settings forms on the 4 px grid with system fields, `AsyncButton` for `Save changes` (B5 + S5), team list rows with square `Avatar` and `AlertDialog` for delete. **Step 4: Run** `voice.spec.ts`, `settings.spec.ts`, `shell.spec.ts` → PASS; axe; 390; shots `voice-picker`, `settings`, `team`.
- [ ] **Step 5: Critic gate.** **Step 6: Commit** `feat(web): voice picker and settings on the riso system`.

### Task 13: Whole-app gates, bundle check, docs, hand-off

**Files:**
- Create: `apps/web/e2e/gates.spec.ts`; Modify: `docs/design/components.md` (statuses), `docs/features/ui-redesign/bundle-baseline.md`, `docs/ROADMAP.md`, `docs/features/01-voice-knowledge/plan.md` (Global constraints: add "UI follows `docs/design/riso-system.md` and uses only `@brandloop/ui` primitives; every new screen passes `critic-rubric.md`")

- [ ] **Step 1: Write `gates.spec.ts`:** for every route in `src/lib/nav.ts` plus `/settings`, `/settings/team`, `/strategy`, `/sign-in`: axe serious/critical = 0; `scrollWidth <= innerWidth` at 390; with `reducedMotion: 'reduce'` no element has a non-identity computed `transform` 50 ms after load; no element uses `backdrop-filter`; no computed `font-family` contains "mono"; `captureSet` for each route when `SHOTS=1`.
- [ ] **Step 2: Run** the entire suite: `pnpm turbo lint typecheck test` and `pnpm --filter @brandloop/web exec playwright test` → PASS.
- [ ] **Step 3: Bundle check:** `pnpm --filter @brandloop/web build`; record `/` First Load JS in `bundle-baseline.md`; delta ≤ 40 KB gz vs baseline (if over, move non-critical motion behind `dynamic()` and re-measure; record what moved).
- [ ] **Step 4: 60 fps check** per `micro-interactions.md` §8 on `/design` (1440 and 390, day and night, 4× CPU throttle) with the Playwright MCP or Chrome; record the results table in `docs/design/micro-interactions.md` §8.
- [ ] **Step 5: Docs:** fill `components.md` statuses and adaptation notes; ROADMAP note; Feature 1 plan constraint line.
- [ ] **Step 6: Final design-critic pass** over the full `shots/` set, then the whole-branch code review; fix wave per SDD.
- [ ] **Step 7: Commit** `chore(ui): redesign gates, bundle record and docs`.

---

## Per-task gates (apply to Tasks 3–12)

0. Implementers of UI tasks invoke `/frontend-design:frontend-design` before building and work from `riso-system.md` and `micro-interactions.md`; where the two conflict, the system doc wins and the conflict is reported.
1. Implementer: tests red → green, `lint typecheck`, the screen's existing spec unchanged and green, shots produced with `SHOTS=1` and `SHOTS_DIR=<plan workspace>/shots`.
2. Task reviewer: spec + quality (SDD).
3. Design critic (controller dispatch, most capable model): `critic-rubric.md` procedure on the shots; A/C/D fails block; two or more B/E fails block.
