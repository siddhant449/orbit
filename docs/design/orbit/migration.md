# Migration: Drafting table → Orbit

What goes, what stays, which tests change, the bundle budget, and the product rename. Task numbers refer to
`docs/features/03-orbit/plan.md`.

## 1. Remove

### 1.1 Code (`packages/ui`)

| Item | Where | Removed in | Notes |
|---|---|---|---|
| Drafting tokens (`--paper`, `--surface`, `--surface-sunk`, `--ink`, `--ink-muted`, `--ink-faint`, `--line`, `--line-strong`, `--keyline`, `--plate`, `--signal*`, `--ghost`, `--on-ink`, `--on-signal`, `--grid-line`, `--radius-control: 2px`, `--shadow-* 1px offsets`, `--ease-ink`, `--ease-exit`) | `src/tokens.css` | O1 replaces values; O4 deletes the aliases | O1 keeps the old names as **aliases pointing at Orbit tokens** so un-migrated screens (and Task 7's in-flight chat files) still render; O4's last step deletes the aliases once nothing references them. Mapping: `paper→ground`, `surface→panel`, `surface-sunk→panel-hover`, `ink→text`, `ink-muted→text-2`, `ink-faint→text-3`, `line→line-2`, `line-strong→line-4`, `keyline→line-3`, `plate→line-2`, `signal/signal-ink→danger`, `on-ink→on-inverse`, `accent→accent`, `focus→accent-text` |
| Drafting type utilities (`type-display-1/2`, `type-title-1/2/3`, `type-body`, `type-ui`, `type-caption`, `type-micro`) | `src/tokens.css` | O1 redefines with Orbit values under the same names (aliases), adds Orbit names (`type-display`, `type-section`, `type-greeting`, `type-page-title`, `type-panel-title`, `type-card-title`, `type-stat`, `type-stat-xl`, `type-lead`, `type-body`, `type-ui`, `type-meta`, `type-mono-data`); O4 deletes the Drafting names |
| "No monospace anywhere" overrides (`--font-mono` → UI face; `code, kbd, samp, pre` reset) | `src/tokens.css` | O1 | `--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace` for the data register (system §4) |
| `icon-sm` / `icon-md` (lucide 1.75 / 1.5) and the `svg.lucide[stroke-width="2"]` override | `src/tokens.css` | O2 (after icons move to the Orbit set) | Orbit strokes 1.6 |
| Drafting devices: `.plate*`, `.skeleton` sweep, `drafting.css` whole file (`.btn*` plated buttons, `.crosshair*`, `.desk-grid`, `.dim*`, `.draw`, `.index-label`, `.kinetic*`, `.land*`, `.meter-fill`, `.nav-row*`, `.rail-in`, `.rule-draw*`, `.ruler`, `.tab*` plates, keyframes `kinetic-set`, `land-drop`, `land-plate`, `rise-in`, `fade-up`, `draw-x/y/path`, `rail-in`) | `src/tokens.css`, `src/drafting.css`, export `./drafting.css` | O1 removes devices not used by Task 7 files; O4 deletes the file | Before deleting each class, grep `apps/web/src`; Task 7 `globals.css` chat rules (`.user-note` …) are restyled in O4 |
| `LineArt` (`src/art/line-art.tsx`) | 6 importers | O3 (last importer gone) | Orbit has no line-art illustrations; empty states use copy + panels |
| `KineticHeading` (per-letter set with offset copies) | 4 importers | O2 | replaced by `LineReveal` (line clip-mask rise, system §7) keeping the accessible-name guarantee (real text in the heading, animated copy `aria-hidden`) |
| `cinematic`, `stampVariants`, `easeInk`, `easeExit`, `springPress` presets | `src/motion/presets.ts` | O1 (renamed), O4 (old names removed) | new `easeOut [.16,1,.3,1]`, `durations {hoverColor:.15, hover:.4, reveal:.9, line:1.2}`, `stagger {line:.08, panel:.12}`, `distance {button:2, panel:8, reveal:18}`, `springMagnet {stiffness:300, damping:24}`; `springLayout` kept |
| `Button` plated variants (`primary` plate/face, `generate`) | `src/button.tsx` | O1 | API kept (see §2), markup becomes a single element (no `btn__face`) |
| Crosshair marks, desk grid, index label in the shell | `apps/web/src/components/shell/app-shell.tsx`, `index-label.tsx`, `sidebar.tsx` | O2 | |
| Archivo + Hanken Grotesk fonts | `apps/web/src/app/layout.tsx` | O1 | Bricolage Grotesque (opsz, wdth) + Geist |
| Toaster `!rounded-[2px] !border-line` | `layout.tsx` | O1 | Orbit toast: `panel`, radius 14, `line` border, 13 px |
| Clerk appearance (graphite, 2px) | `layout.tsx` | O1 | system §3 |
| `/design` Drafting sections (`devices.tsx`, `palette.tsx`, `type.tsx`, `token-hex.tsx`, `theme-toggle.tsx`) | `apps/web/src/app/(dev)/design` | O1 | rebuilt as the Orbit system page (p30); stays a 404 in production (keep `page.test.tsx`) |
| Kleo landing clone (Kleo copy, Framer image URLs, Manrope/Geist from Google Fonts CDN) | `apps/marketing/*` | O5 | replaced wholesale |

### 1.2 Docs to archive

Move (git mv, not delete) to `docs/design/archive/drafting-table/` in O1, each with a one-line banner "Superseded by
docs/design/orbit/ on 2026-10-22":
`docs/design/system.md`, `components.md`, `micro-interactions.md`, `interaction-research.md`, `critic-rubric.md`,
`references.md`, `refs/` (reference images), and `docs/features/ui-redesign/plan.md` (`bundle-baseline.md` stays in place: its
measuring method and baseline remain valid). Update links in `docs/ROADMAP.md` and `docs/features/02-ai-core/plan.md` ("on the
design system" references) to point at `docs/design/orbit/system.md`.

## 2. Keep

| Item | Why / how |
|---|---|
| `MotionProvider` (`@brandloop/ui/motion`: `LazyMotion` strict + `MotionConfig reducedMotion="user"`) | unchanged; Orbit motion uses `m.*` |
| `useMotionSafe`, `useReducedMotionPref`, `useMediaQuery`, `REDUCED_MOTION` | unchanged |
| `CountUp` | restyled defaults: 1.2 s, out-expo, first view per session (sessionStorage key per metric) |
| `Reveal`, `SmoothScroll` (`@brandloop/ui/scroll`) | `Reveal` defaults become 900 ms / 18 px / out-expo; Lenis behaviour unchanged |
| `Button` API: `variant` (`primary`, `secondary`, `ghost`, `danger`, `generate` alias), `size` (`sm`, `md`, `icon`, `icon-lg`), `asChild` | keep names so call sites compile; map `primary/generate → accent fill`, `secondary → ghost outline (line-strong)`, `ghost → text pill`, `danger → danger outline`; add `paper`, `inverse`, `micro`, `send` variants and `size: "lg"` (52 px CTA) |
| `Input`, `Label`, `Hint`, `NativeSelect` | API kept; restyled (input: `ground` bg, `line-2` border dark / `line-input` light, radius 14, focus ring `accent-text`) |
| `cn` | unchanged |
| Shell behaviour: `AppShell`, collapse to rail (⌘B, localStorage), drawer at <768, `CommandPalette` (⌘K), `RouteFocus`, `AccountProvider`, profile menu, section panels from `lib/nav.ts` | behaviour kept; markup restyled; nav labels change per §4 |
| `next-themes` | kept; `defaultTheme` changes from `system` to `dark`, attribute simplified to `class` (`.light` / `.dark`), see system §3 |
| `scripts/bundle-size.mjs` and the measuring method | unchanged |
| Task 7 component boundaries (`components/chat/*`, `ChatHistory`, `HomeChat`, `useChatSession`) | O4 restyles inside them; no API changes |

## 3. Product rename to "Orbit" (decided by the user, 2026-10-22)

Rule: every user-visible string says Orbit; internal identifiers (`@brandloop/*` packages, env vars, DB names, localStorage keys
`brandloop:*`, log prefixes) stay. Wordmark is lower-case `orbit`; in sentences "Orbit".

| # | File (worktree `ai-core`) | Current | New | Task |
|---|---|---|---|---|
| R1 | `apps/web/src/app/layout.tsx:14` | `title: { default: "Brandloop", template: "%s · Brandloop" }` | `"Orbit"`, `"%s · Orbit"` | O1 |
| R2 | `apps/web/src/app/layout.tsx:15` | description "Write LinkedIn posts that sound like you." | keep or Orbit lead "Orbit turns what you already know into a weekly rhythm of posts, comments and conversations." (controller copy call; default keep) | O1 |
| R3 | `apps/web/src/components/shell/logo.tsx:25` | wordmark "Brandloop" | Orbit mark + `orbit` | O2 |
| R4 | `apps/web/src/components/shell/sidebar.tsx:30` | index label fallback "Brandloop" | removed with the index label | O2 |
| R5 | `apps/web/src/components/shell/sidebar.tsx:34,80` | `aria-label="Brandloop home"` (×2) | `"Orbit home"` | O2 |
| R6 | `apps/web/src/app/(app)/settings/integrations/page.tsx:10` | "Use Brandloop from other AI assistants." | "Use Orbit from other AI assistants." | O3 |
| R7 | `apps/web/src/app/(app)/settings/help/page.tsx:9` | "…how to get more from Brandloop." | "…how to get more from Orbit." | O3 |
| R8 | `apps/web/src/app/(dev)/design/page.tsx:33` | "The design system for Brandloop: …" | rewritten with the page (Orbit system) | O1 |
| R9 | `apps/web/src/components/chat/chat-composer.tsx:100` (Task 7) | placeholder "Brandloop is writing…" | "Orbit is writing…" | O4 |
| R10 | `apps/web/src/components/chat/message-list.tsx:34` (Task 7) | sr-only "Brandloop: " | "Orbit: " | O4 |
| R11 | `apps/web/src/lib/chat-api.ts:59` | "Attachments must be files uploaded to Brandloop." | "…uploaded to Orbit." | O4 (Task 7 file family; coordinate) |
| R12 | `packages/agent/src/prompt.ts:24,27` | "You are Brandloop's writing partner…", "…copies posts out of Brandloop themselves." | "Orbit's", "out of Orbit" (assistant replies may name the product) | O4 (prompt-cache prefix changes once; `prompt.test.ts` asserts length/prefix only, no string) |
| R13 | `packages/knowledge/src/extract/url.ts:133` | UA `BrandloopBot/1.0` | `OrbitBot/1.0` (visible to fetched sites) | O4 |
| R14 | Clerk dashboard: application name, email templates, sender name | "Brandloop" (dashboard setting, not in repo) | "Orbit" | controller action (no code); listed in preflight |
| R15 | Emails | none in repo today (Clerk-hosted only) | n/a | |
| R16 | `apps/marketing/index.html` etc. | Kleo branding (title "Kleo - #1 AI Personal Brand Tool", 43 "Kleo" strings, `app.kleo.so` links) | Orbit site | O5 |
| R17 | `packages/ui/src/tokens.css:2`, `drafting.css:2` comments | "Brandloop design tokens…" | comments only; rewritten in O1 | O1 |
| R18 | `docs/ROADMAP.md` "Working name: Brandloop" | | "Product name: Orbit (packages stay @brandloop/*)" | O1 |

No e2e spec asserts the string "Brandloop" (checked: `apps/web/e2e/*`), and no spec asserts a page `<title>`.

## 4. E2E accessible-name changes (deliberate Orbit copy only)

Everything else keeps its accessible name (nav landmark "Main", complementary "Sidebar", "Collapse sidebar" / "Expand
sidebar", "Open navigation" / "Close navigation", "Profile menu", "Message", "Send", "Stop", "Change writing style", "Search
writing styles", "Ways to start", memories/voice/strategy names, toasts).

| # | Spec:line | Old | New | Reason | Task |
|---|---|---|---|---|---|
| E1 | `showpiece.spec.ts:7` (`HEADING`) and uses at the heading assertions | `"What are we writing today?"` | `/What are we putting out there\?/` (greeting prefix varies by time of day) | Orbit greeting [p01] | O2 |
| E2 | `shell.spec.ts:14` | same | same regex | | O2 |
| E3 | `showpiece-record.spec.ts:30,89` | same | same regex | | O2 |
| E4 | `chat.spec.ts:53` (`toHaveCount(0)`) | same | same regex | | O2 (edit lands after Task 7 merges; preflight) |
| E5 | `showpiece.spec.ts:103`, `showpiece-record.spec.ts:88` (and chat.spec "New chat" link uses, if any) | link "New chat" in nav "Main" | "New draft" | Orbit nav [p01] (decision D1; if the controller keeps "New chat", drop E5) | O2 |
| E6 | `design.spec.ts` (whole file) | Drafting heading "Drafting table", `--paper` #F3F1EC / #15161A, Archivo/Hanken, `font-stretch`, "Night" toggle | rewritten: heading "Orbit design system", `--ground` `#0E0E10` (dark default) / `#F5F4F0` (light), fonts Bricolage Grotesque / Geist, `font-variation-settings` checks, theme buttons "Light theme" / "Dark theme" / "System theme" with `aria-pressed` | new system | O1 |
| E7 | `strategy.spec.ts:33` | `toHaveClass(/bg-surface-sunk/)` | `toHaveClass(/bg-panel-hover/)` (or a `data-selected` attribute; prefer the attribute) | token rename | O3 |
| E8 | `drafting.spec.ts` | name/filename | rename to `routes.spec.ts`, title "every route: axe dark and light, 390 px, screenshots"; assertions unchanged | system rename | O1 |
| E9 | `showpiece.spec.ts:35-39` "no canvas, final frames only" | reduced motion: no `<canvas>` | unchanged (the app has no canvas in Orbit) | | — |
| E10 | Settings sub-nav label | "Talk to a person" (nav label + page title) | "Talk to us" | Orbit [p14]; no spec asserts it today | O3 |
| E11 | Settings sub-nav label | "Billing" | "Billing and subscription" | Orbit [p14]; no spec asserts it | O3 |
| E12 | Ideas sub-nav labels | "Inspiration", "Templates", "Images" | "Swipe file", "Hooks", "Created by you" (group "Carousels") | Orbit [p13]; `shell.spec.ts:39` navigates the palette with "templates": keep the palette keyword "templates" as an alias of "Hooks" so the spec passes unchanged | O3 |
| E13 | Chat-history group labels | Task 7: "Previous 7 days", "Previous 30 days" | keep Task 7 labels (Orbit "Last 7 days" / "Last 30 days" is a copy-only difference); `chat.spec.ts:94` "Pinned" unchanged | stability (decision D8) | — |

The composer's accessible name stays **"Message"** (Orbit's hidden label is the placeholder sentence "Give Orbit a thought, a
link or a voice note"; we use it as the placeholder only). This avoids 15 spec edits and keeps a short screen-reader label
(decision D2).

## 5. Bundle budget

Reference: `docs/features/ui-redesign/bundle-baseline.md`. Current home First Load JS gzip **320,948 B** (baseline 264,361 B;
budget +90 KB eager = **356,521 B ceiling**). Headroom today: 35,573 B.

| Route | Current gzip | Orbit ceiling | Notes |
|---|---:|---:|---|
| `/` | 320,948 | 356,521 (unchanged budget) | removing `KineticHeading`, `LineArt`, `drafting.css` devices and lucide chrome icons should net negative; `LineReveal` and the composer aura are CSS |
| `/strategy` | 351,340 | 351,340 + 5 KB | |
| `/settings` | 315,124 | 315,124 + 5 KB | |
| `/sign-in` | 220,521 | 220,521 (no growth) | auth pages get fonts + tokens only |

Rules: fonts are CSS (not counted) but Bricolage with `opsz`+`wdth` axes is ~130 KB woff2 latin (p30 bundle `e58a29e3…`
131,548 B): preload only latin, `display: swap`, and check LCP on home. No GSAP, SplitType or R3F in `apps/web`. Charts (O8) use
hand-rolled SVG, no chart library, and load per route. Each O-task that touches eager code records the four numbers above in
`bundle-baseline.md` under a new "Orbit" heading.

Marketing (`apps/marketing`, static): total transfer budget on first view ≤ 350 KB compressed including fonts (two variable
woff2, latin) and ≤ 40 KB JS (vanilla). No third-party CDN requests (fonts and Lenis vendored).

## 6. Order of removal (summary)

O1: new tokens (dark default + light) with Drafting aliases, fonts, theme provider + Settings control, primitives restyle,
`/design` = Orbit page, devices not used by Task 7 removed, docs archived. O2: shell + home, `KineticHeading` and shell devices
removed. O3: remaining screens, `LineArt` removed. O4 (after Task 7 merges): chat restyle, aliases + `drafting.css` +
Drafting type names deleted, final grep must find zero Drafting token names in `apps/web/src` and `packages/ui/src`.
