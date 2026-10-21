# Feature 3: Orbit — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Drafting-table frontend with the Orbit design (dark studio app with a light theme, cinematic marketing
site), rename the product to **Orbit** in all user-visible copy, and lay out one task per Orbit screen whose feature is not built
yet.

**Spec (binding):** `docs/design/orbit/system.md` (tokens, type, components, motion), `docs/design/orbit/screens.md` (per-screen
layout and data), `docs/design/orbit/migration.md` (removals, keeps, rename table R1-R18, e2e changes E1-E13, bundle budget).
Source artboards: `.recon/orbit/pages/pageNN.html` (unpack the `__bundler/manifest` + `__bundler/template` with `python3 -I`;
values must come from there, not from screenshots). Preflight and open decisions:
`/home/siddhant/Desktop/kleo-clone/.superpowers/sdd/ai-core/orbit-preflight.md`.

**Tech stack:** Next.js 16.4.2 (Turbopack), React 19.3, Tailwind v4 (`@theme inline`), `motion` 14.4 via `MotionProvider`
(`m.*`, `LazyMotion` strict), `next-themes` 0.4, `next/font/google` (Bricolage Grotesque, Geist), Radix, Clerk 7, Vitest 5,
Playwright + `@axe-core/playwright`. Marketing: a Next.js 16 app (`apps/marketing`, same stack as apps/web, no Clerk), ruling A16.

## Global Constraints

- **No route transitions.** Routes switch instantly. Entry fade-rise animations run on the document's first paint only, never on
  client navigation (system §7.3). In-page motion (hover, focus aura, ring/chart draw, count-up, `layoutId` indicators,
  disclosure) is expected and must be cinematic per system §7.
- **No custom cursor, no sound, no riso devices** (no dither, colour plates, halftone). CSS film grain (system §2.5) is allowed.
- **Reduced motion:** every animation has the fallback in system §7.4; looping animations stop; transforms become fades.
- **Off-screen:** infinite animations pause when not visible (system §7.5).
- **Accessibility:** axe 0 serious/critical in dark and light on every route touched; use the adjusted text-3 and hover values
  (system §2.4); visible `:focus-visible` ring; accessible names unchanged except migration §4 (E1-E13) — any other spec edit
  is a review failure.
- **390 px:** no horizontal page scroll on any route (board columns scroll inside their own container).
- **Theme:** dark is the default for the app; Light/Dark/Auto in Settings (system §3).
- **Name:** "Orbit" in user-visible copy; `@brandloop/*` package names, env vars, DB names and `brandloop:*` storage keys stay.
- **Sample data:** never ship Orbit's sample names or numbers as if real. Unbuilt features show honest empty states
  (screens.md lists each).
- **Fonts:** self-hosted through `next/font/google` (`Bricolage_Grotesque` with `axes: ["opsz","wdth"]`, `Geist`), latin
  preloaded. Marketing vendors the woff2 files (OFL).
- **Dependencies:** pnpm release-age policy, never `minimumReleaseAgeExclude`; if the newest version is refused, pin an older
  exact version. TypeScript 5.9.3. No GSAP, SplitType, R3F/three, chart libraries or icon fonts unless a controller decision
  in the preflight adds them.
- **Ownership:** Task 7 of `docs/features/02-ai-core/plan.md` (chat UI) is in flight in this worktree and owns
  `apps/web/src/components/chat/*`, `apps/web/src/app/(app)/chat/*`, `apps/web/e2e/chat.spec.ts`, and its touch points in
  `components/shell/sidebar.tsx`, `components/home/composer.tsx`, `app/(app)/page.tsx`, `app/globals.css`, `lib/chat-*`.
  O1-O3 must not edit those files until Task 7 is committed; O2 waits for the Task 7 commit (gate below). O4 is the only Orbit
  task that edits chat files.
- **Shared processes:** implementers never run the dev server or Playwright (the controller owns :3000 and runs e2e at the
  gates); they write and update specs.
- **Bundle:** measure with `node scripts/bundle-size.mjs apps/web / /strategy /settings /sign-in/[[...sign-in]]` after
  `pnpm --filter @brandloop/web build`; record under an "Orbit" heading in `docs/features/ui-redesign/bundle-baseline.md`;
  ceilings in migration §5.
- **Checks per task:** run separately: `pnpm --filter @brandloop/ui test`, `pnpm --filter @brandloop/ui typecheck`,
  `pnpm --filter @brandloop/web test`, `pnpm --filter @brandloop/web typecheck`, `pnpm --filter @brandloop/web lint`.
- **LinkedIn:** nothing publishes, schedules, reposts or comments on LinkedIn; recon of app.kleo.so may read anything but never
  triggers those actions.
- **Commits:** the controller commits by path. End messages with a blank line, then
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus (whole feature)

1. Values match the Orbit sources (spot-check 10 tokens/sizes per task against `.recon/orbit` with the cited page).
2. No route-level fade or delayed paint after client navigation (watch a recording of two nav clicks).
3. Reduced-motion run: no transform, no loop, final values shown.
4. Accessible names: only E1-E13 changed; the e2e diff contains no other edits.
5. Light theme parity: every component reviewed in both themes; no hard-coded dark hex in components (tokens only).
6. Honest data: no Orbit sample content rendered in the app.

## Order and gates

| # | Task | Depends on | Gate after |
|---|---|---|---|
| O1 | Foundation: tokens, fonts, theme, primitives, `/design`, Drafting devices out, docs archived | — | controller: `design.spec`, `routes.spec` (axe dark+light, 390) |
| O2 | App shell + home | O1, **Task 7 committed** | controller: shell, showpiece, chat (mock) e2e |
| O3 | Existing screens restyle (memories, strategy, voice, knowledge, settings, sections, placeholders, auth) | O2 | controller: memories, voice, strategy, shell, routes e2e |
| O4 | Chat thread restyle on Task 7 components; delete Drafting aliases | O2, Task 7 | controller: chat e2e (mock) + full suite |
| O5 | Marketing rebuild (`apps/marketing`) | O1 (tokens/fonts reference only) | controller: Lighthouse + axe on the static site at 1440 and 390 |
| O6-O14 | Future screens (stubs) | their feature | per task |

O5 can run in parallel with O2-O4 (separate app). O3 and O4 can run in parallel after O2 if two implementers are available
(disjoint files).

---

### Task O1: Foundation

**Files:**
- Modify: `packages/ui/src/tokens.css` (rewrite), `packages/ui/src/button.tsx`, `packages/ui/src/field.tsx`,
  `packages/ui/src/motion/presets.ts`, `packages/ui/src/motion/count-up.tsx`, `packages/ui/src/scroll/reveal.tsx`,
  `packages/ui/src/index.ts`, `packages/ui/package.json` (exports: add `./icons`, keep `./drafting.css` until O4)
- Modify: `packages/ui/src/drafting.css` (delete classes with no importer outside Task 7 files; leave the rest for O4)
- Create: `packages/ui/src/icons/index.tsx` (Orbit icon set, system §6.1), `packages/ui/src/orbit/{logo.tsx, ring.tsx,
  pill.tsx, segmented.tsx, panel.tsx, status-pill.tsx, composer-shell.tsx, line-reveal.tsx, grain.tsx}` + tests
- Create: `apps/web/src/components/theme/theme-switch.tsx` (Light / Dark / Auto)
- Modify: `apps/web/src/app/layout.tsx` (fonts, metadata R1, ThemeProvider `defaultTheme="dark"`, `attribute="class"`,
  `storageKey="orbit-theme"`, Clerk appearance, Toaster)
- Rewrite: `apps/web/src/app/(dev)/design/page.tsx` and its `sections/*` as the Orbit system page (p30); keep
  `page.test.tsx` (404 in production)
- Rewrite: `apps/web/e2e/design.spec.ts` (E6); rename `apps/web/e2e/drafting.spec.ts` → `routes.spec.ts` (E8)
- Move: Drafting docs to `docs/design/archive/drafting-table/` (migration §1.2); modify `docs/ROADMAP.md` (R18)

**Interfaces:**
- CSS variables (both themes, system §2): `--ground --ground-hero --panel --panel-hover --inverse --on-inverse --text
  --text-soft --text-2 --text-3 --icon --faint --line-faint --line-soft --line-row --line --line-2 --line-3 --line-4
  --line-strong --line-hover --line-input --line-paper --accent --accent-hover --accent-text --accent-text-2 --accent-tint
  --cobalt --on-accent --danger --selection-mark --shadow-card --shadow-composer --shadow-draft --shadow-hover --ease-out
  --dur-hover-color --dur-hover --dur-reveal --dur-line`; `:root` = dark, `:root.light` = light. Tailwind colours via
  `@theme inline` with the same names; radii `--radius-pill 999px`, `--radius-card-sm 14px`, `--radius-card 18px`,
  `--radius-card-lg 24px`, `--radius-shot 28px`; fonts `--font-display`, `--font-sans`, `--font-mono` (ui-monospace stack).
- Drafting aliases (temporary, removed in O4): the mapping in migration §1.1.
- Type utilities: `type-display type-section type-greeting type-page-title type-panel-title type-card-title type-stat
  type-stat-xl type-lead type-body type-ui type-meta type-mono-data` with the exact axes/tracking of system §4.1; Drafting
  utility names re-pointed to the nearest Orbit step until O4.
- `presets.ts`: `easeOut`, `durations`, `stagger`, `distance`, `springMagnet`, `springLayout` (kept); old names re-exported as
  deprecated aliases until O4.
- `Button` variants per migration §2 (`primary secondary ghost danger generate paper inverse micro send`; sizes `sm md lg icon
  icon-lg`).
- `Ring({ value, max, size, strokeWidth, label })` (`role="img"`, aria-label "<label>, value of max"); `Segmented({ options,
  value, onChange, label })` (radio group semantics, `layoutId` indicator); `StatusPill`, `Pill`, `Panel({ as, interactive })`,
  `LineReveal({ as, lines, className })` (heading text in DOM once, animated copy `aria-hidden`), `Grain`, `Logo({ size,
  withWordmark })`, `ComposerShell` (box + aura CSS, system §6.5).
- `ThemeSwitch`: three buttons "Light theme" / "Dark theme" / "System theme", `aria-pressed`.

**Steps:**
- [ ] 1. Unpack p30, p31, p01, p17 with `python3 -I` into a scratch dir; keep the token table from system §2 open beside them.
- [ ] 2. Write failing tests: `packages/ui` — `Ring` computes `stroke-dashoffset = C × (1 − value/max)` and exposes its label;
  `Segmented` arrow-key navigation and `aria-checked`; `Button` renders one element per variant (no `btn__face`);
  `LineReveal` keeps `textContent` equal to the full heading; presets export `easeOut = [0.16, 1, 0.3, 1]`.
- [ ] 3. Rewrite `tokens.css` (dark default, `.light` overrides, aliases, utilities, base layer: body `ground`/`text`, Geist,
  `:focus-visible` ring `accent-text`, `::selection` `selection-mark`, reduced-motion rule per system §7.4).
- [ ] 4. Fonts in `layout.tsx`: `Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz","wdth"], variable:
  "--font-display-face", display: "swap" })`, `Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" })`.
- [ ] 5. Theme: `ThemeProvider attribute="class" defaultTheme="dark" enableSystem themes={["light","dark"]}
  storageKey="orbit-theme" disableTransitionOnChange`; replace any `data-theme` selectors; Clerk appearance (system §3).
- [ ] 6. Primitives + icons + Orbit components (Interfaces). Restyle `Input`/`NativeSelect` (radius 14, `line-2`/`line-input`).
- [ ] 7. `/design` page = p30 rebuilt with the real components: header ("Orbit · design system"), dark and light token cards
  (live values via `getComputedStyle`), type specimens with `data-testid` per step, radii/spacing/shadow, icons, components
  dark and light (rendered inside a forced-theme wrapper), motion catalog, `ThemeSwitch`. H1 "Orbit design system".
- [ ] 8. Delete Drafting devices with no importers outside Task 7 files (grep each class); remove the "no monospace" overrides.
- [ ] 9. Update `design.spec.ts` (E6) and rename `drafting.spec.ts` (E8). Archive docs; ROADMAP R18.
- [ ] 10. Run the checks; build; record bundle numbers.

**Tests:** unit tests in step 2; `design.spec.ts`: dark default `--ground` `#0E0E10`, after "Light theme" `#F5F4F0`; fonts
loaded match `/Bricolage/` and `/Geist/`; `type-page-title` has `font-variation-settings` containing `"opsz" 72, "wdth" 90`;
axe dark + light; 390 no horizontal scroll; screenshots 1440/390 both themes. `routes.spec.ts` unchanged assertions pass.

**Review focus:** token values versus p30/p17 (including the §2.4 deviations); dark-first paint without a flash (no-JS render
is dark); aliases keep every un-migrated screen legible in both themes (screenshot sweep); Task 7 files untouched.

---

### Task O2: App shell and home

**Gate:** Task 7 committed (`git log` shows `feat(web): chat screen, tool activity rows, history list`). Rebase/merge first.

**Files:**
- Modify: `apps/web/src/components/shell/{app-shell.tsx, sidebar.tsx, nav-link.tsx, logo.tsx, profile-menu.tsx,
  command-palette.tsx, avatar.tsx}`; delete `index-label.tsx`, crosshair markup
- Create: `apps/web/src/components/shell/{sprint-card.tsx, top-bar.tsx, notifications.tsx, mobile-tabbar.tsx,
  mobile-header.tsx}`
- Modify: `apps/web/src/lib/nav.ts` (items: New draft, Posts, Ideas, Activities, Engage, Analytics; counts optional; ⌘J hint)
- Create: `apps/web/src/app/(app)/engage/page.tsx` (placeholder in the Orbit empty-state style)
- Modify: `apps/web/src/components/home/composer.tsx` (restyle only; keep Task 7's `onSend` prop and all accessible names),
  `apps/web/src/components/home/voice-picker.tsx` (trigger becomes the voice pill), `apps/web/src/app/(app)/page.tsx`
  (greeting + cards props), `apps/web/src/components/chat/home-chat.tsx` **only** to place the cards below the composer (one
  additive slot prop; coordinate in the report)
- Create: `apps/web/src/components/home/{greeting.tsx, home-cards.tsx}` + `apps/web/src/lib/greeting.ts` (+ test)
- Modify: `packages/ui/src/motion/kinetic-heading.tsx` → delete (replaced by `LineReveal`); update importers
- Modify specs: E1-E5 (`showpiece.spec.ts`, `shell.spec.ts`, `showpiece-record.spec.ts`, `chat.spec.ts` line 53 only)

**Interfaces:**
- `greetingFor(date: Date, timeZone: string): "Good morning." | "Good afternoon." | "Good evening."` (≤11:59 morning,
  ≤17:59 afternoon, else evening, in the profile timezone).
- `HomeCards({ strategy: StrategySummary | null, latestChat: { id, title, lastActivityAt } | null })` renders the three cards
  of screens.md B1 with the empty states written there (Today's post → `/challenge`, Activities → informational, Your week →
  strategy slots or "Build your strategy").
- `SprintCard({ state: { kind: "not-started" } | { kind: "active", day, title, posted, planned } })`; O2 always passes
  `not-started` (no challenge data).
- `TopBar({ title?: ReactNode, crumb?: string, actions?: ReactNode })`; `Notifications()` popover (empty state "Nothing new").
- Nav counts: `NavItem.count?: number` rendered only when a number is provided (none in O2).

**Steps:**
- [ ] 1. Unpack p01, p03 (sidebar active-row variant), p13/p14 (rail), p16/p17/p29.
- [ ] 2. Failing tests: `greeting.test.ts` (timezone boundaries); `home-cards` renders the strategy branch and both empty
  branches with no Orbit sample strings (assert none of "The contrarian take", "Comment on 8 posts", "Tue · The checklist"
  appear); sidebar renders nav names "New draft", "Posts", "Ideas", "Activities", "Engage", "Analytics" inside nav "Main".
- [ ] 3. Sidebar (system §6.9): header (logo R3/R5, ⌘K pill), sprint card, nav with `layoutId` active indicator and active icon
  colour, Task 7 `ChatHistory` restyled via props/classes passed from the sidebar (do not edit `chat-history.tsx` here; if
  styling needs changes inside it, leave a TODO for O4), profile footer. Rail variant for collapsed state and S2 sections.
- [ ] 4. Top bar + notifications pill/popover. ⌘J focuses the composer on `/` or navigates to `/`.
- [ ] 5. Home: ambient glow + grain layer, `Greeting` with `LineReveal` (first paint only), composer restyle (system §6.5, aura
  CSS, voice pill), "Ways to start" chips row restyled (decision D4), `HomeCards` (first-paint stagger 120 ms).
- [ ] 6. Mobile (<768): `MobileHeader` (logo, sprint pill with 16 px ring, search), `MobileTabbar` (system §9); drawer stays
  behind "Open navigation".
- [ ] 7. Remove crosshairs, index label, `KineticHeading`; swap shell icons to `@brandloop/ui/icons`.
- [ ] 8. Spec edits E1-E5; run checks; bundle numbers (home must stay ≤ 356,521 B gzip).

**Tests:** unit (step 2); e2e (controller): showpiece (heading regex, reduced motion final frames, 390 drawer, sidebar collapse
to rail and back, route focus), shell (profiles, palette), chat (mock) still green; screenshots p01/p17/p16 side by side.

**Review focus:** no route fade (client nav renders instantly); greeting accessible name stable while animating; cards show
zero fabricated data; sidebar `aria-current` and keyboard order; light theme parity with p17.

---

### Task O3: Existing screens restyle

**Files:**
- Modify: `apps/web/src/components/page.tsx` (page header: `type-page-title`, subtitle `text-2`, actions slot; Orbit empty
  state component), `apps/web/src/lib/nav.ts` (section labels E10-E12; Strategy first in Discover, Knowledge under My library
  — decision D7; palette alias "templates" → Hooks)
- Modify: `apps/web/src/components/memories/*`, `components/strategy/*`, `components/settings/*`, `components/shell/
  add-profile-dialog.tsx`, `apps/web/src/app/(app)/{strategy,knowledge-base,ideas,inspiration,following,templates,images,saves,
  posts,activities,analytics,challenge}/page.tsx`, `apps/web/src/app/(app)/settings/**/page.tsx` (R6, R7),
  `apps/web/src/app/(auth)/**`
- Modify: `apps/web/src/components/home/voice-picker.tsx` popover body (combobox "Search writing styles", options, "Add your
  style", "Learn my style" dialog)
- Delete: `packages/ui/src/art/line-art.tsx` and its export once the last importer is gone
- Modify spec: E7 (`strategy.spec.ts:33`; prefer adding `data-selected` to the mix row and asserting it)

**Interfaces:** `PageHeader({ title, subtitle?, actions? })`; `EmptyState({ title, body, action? })` (panel, `text-2` body,
optional primary pill); `SectionNav` rendered in S2 with the active dot (system §6.9). Settings integrations page renders the
p14 layout with every card's action disabled-with-toast ("Not available yet") — no "Active"/"Connected" states.

**Steps:**
- [ ] 1. Unpack p13, p14, p27; read screens.md B11, B12, B14.
- [ ] 2. Failing tests: `nav.test.ts` (section labels, Strategy and Knowledge placement, palette keyword "templates" resolves to
  `/templates`); integrations page renders no element with text "Active" or "Connected".
- [ ] 3. Page header + empty state; placeholders for unbuilt routes use `EmptyState` with one sentence of what is coming.
- [ ] 4. Strategy: panels, segmented controls, mix percentages as `type-stat`, audience balance as progress bars, Regenerate
  confirmation dialog restyled (copy unchanged).
- [ ] 5. Memories: panel rows, add/edit inline, import dialog (Radix) on `panel` with radius 24; toasts unchanged.
- [ ] 6. Knowledge base: board-card rows with status pills, dashed add card.
- [ ] 7. Voice picker popover and "Add your style" dialog; alert copy unchanged.
- [ ] 8. Settings: S2 sub-nav with `ThemeSwitch` at the bottom (system §3), Manage account form (labels unchanged: "Profile
  name", "Timezone", "Save changes"), Manage team, Billing and subscription, Community, Talk to us, Integrations (p14 layout,
  honest states).
- [ ] 9. Auth pages: centred Clerk card on `ground` + glow + grain, logo.
- [ ] 10. Remove `LineArt`; E7; run checks; bundle numbers for `/strategy` and `/settings`.

**Tests:** unit (step 2); e2e (controller): memories, voice, strategy (E7), shell ("Settings saved", profile switch), routes
sweep (axe both themes, 390).

**Review focus:** form labels and toast strings unchanged; no fake integration state; S2 layout at 768-1023 (rail only) and
<768 (drawer); dialogs trap focus and restore it.

---

### Task O4: Chat thread restyle and Drafting removal

**Gate:** Task 7 committed; O2 merged. Coordinate with whoever owns ai-core Tasks 8-10 (documents/side panel) so they build on
Orbit components from here on (preflight D5).

**Files:**
- Modify: `apps/web/src/components/chat/{chat-view.tsx, message-list.tsx, message-parts.tsx, tool-row.tsx, chat-composer.tsx,
  chat-history.tsx, knowledge-picker.tsx, markdown.tsx}`, `apps/web/src/app/(app)/chat/[id]/page.tsx`,
  `apps/web/src/app/globals.css` (replace the Task 7 Drafting chat rules), `apps/web/src/lib/chat-api.ts` (R11)
- Create: `apps/web/src/components/chat/{steps-disclosure.tsx, memory-tag.tsx, assistant-avatar.tsx, chat-top-bar.tsx}`
- Modify: `packages/agent/src/prompt.ts` (R12), `packages/knowledge/src/extract/url.ts` (R13)
- Delete: `packages/ui/src/drafting.css` (+ export), Drafting aliases and utility names in `tokens.css`, deprecated preset
  aliases in `presets.ts`

**Interfaces:**
- `StepsDisclosure({ parts, durationMs? })`: `<details>` with summary "Worked through N steps" (N = tool parts), one row per
  step using `toolLabel`; errors use the `danger` token and the error label. Used for every run of ≥1 tool part (decision D6;
  if the controller keeps Task 7's ≥3 rule, keep it).
- `MemoryTag({ area, change, href? })` from memory/voice tool results (mono data register, system §6.14).
- Draft card (system §6.12) is **not** built here (needs Task 8 documents); leave a typed placeholder export
  `DraftCard` behind a `TODO(Task 9)` that renders nothing.
- Chat top bar: title `h1` (keeps the e2e `heading level 1` = chat title), timestamp, Rename (aria-label "Rename chat" opens
  the existing rename flow: field "Chat title"), More (aria-label "More actions", menu items Rename / Pin / Delete).
  The existing per-row "Chat options, <title>" button in history stays.

**Steps:**
- [ ] 1. Unpack p03, p18; read Task 7 components and `chat.spec.ts` to list every accessible name they assert.
- [ ] 2. Failing tests: `steps-disclosure.test.tsx` (count, labels, error row), `memory-tag.test.tsx`.
- [ ] 3. Thread layout (max 780, gap 28, assistant avatar column, user bubble, composer docked with aura); top bar.
- [ ] 4. Tool rows → `StepsDisclosure`; memory tool results → `MemoryTag`; markdown typography on Orbit type.
- [ ] 5. History rows restyle (active row `line-row`), row menu on `panel`.
- [ ] 6. R9-R13 copy; prompt change noted in the report (cache prefix changes once).
- [ ] 7. Delete Drafting CSS/aliases; `rg -n "(paper|surface-sunk|ink-muted|ink-faint|keyline|plate|signal)" apps/web/src
  packages/ui/src` returns nothing outside comments; run checks; bundle numbers.

**Tests:** unit (step 2); e2e (controller): `chat.spec.ts` unchanged except E4 (already done in O2) — tool row "Saved to
memory" visible (inside the disclosure: the summary must be open by default while a run is live, collapsed after), history,
409 recovery, stop; full suite in both themes.

**Review focus:** streaming performance (no layout thrash from the disclosure); "Saved to memory" still visible for the spec;
reduced motion; the final grep.

---

### Task O5: Marketing rebuild (`apps/marketing`) as a Next.js app

**Ruling A16 (user, 2026-10-22: "make sure we are using next js"):** `apps/marketing` becomes a Next.js app on the same
versions as `apps/web` (next 16.4.2, React 19.3, Tailwind v4, TypeScript 5.9.3; App Router, Turbopack, `proxy.ts` not needed,
no Clerk). The old static `index.html`/`styles.css`/`main.js`/`assets/*` (Kleo clone) are deleted.

**Files:** replace `apps/marketing/*` with a Next app: `package.json` (`@brandloop/marketing`, scripts `dev` = `next dev -p 4321`,
`build`, `start`, `lint`, `typecheck`), `next.config.ts` (`transpilePackages: ["@brandloop/ui"]`), `tsconfig.json`,
`src/app/{layout.tsx, page.tsx, globals.css, opengraph-image or static OG}`, `src/components/marketing/*` (one component per
section C1–C13), `src/lib/config.ts` (`NEXT_PUBLIC_APP_URL`, default `http://localhost:3000`, for Sign in / Get started), fonts via
`next/font` (Bricolage Grotesque variable + Geist, same setup as apps/web), Orbit tokens imported from `@brandloop/ui` (marketing
alternates ink and paper sections per system §2), `public/logo.svg` (Orbit mark). Add the app to turbo pipelines and the root
lint/typecheck. Lenis via the workspace's pinned `lenis` 1.3.27 package (decision D3), motion via `motion` (ruling A12).

**Interfaces:** sections C1–C13 of screens.md with ids `#product #loop #sprint #proof #journal #pricing #team #faq`; every
placeholder claim wrapped in an element with `data-placeholder` (decision D9 / ruling A14). Static rendering (`export const
dynamic = "force-static"`); client components only where motion/interaction needs them.

**Steps:**
- [ ] 1. Unpack p00, p02, p04, p06 (and p30/p31); extract exact markup values per section.
- [ ] 2. Tokens as CSS variables (marketing subset of system §2) + `@font-face` with the vendored woff2 (latin, `font-display:
  swap`, `font-weight 200 800`, `font-stretch 75% 100%` for Bricolage).
- [ ] 3. Build C1-C12 at 1440 with semantic landmarks (header/nav "Primary", main, sections with `aria-labelledby`, footer
  navs "Product"/"Learn"/"Company").
- [ ] 4. Motion in client components (`motion` + Lenis): first-paint hero sequence; one IntersectionObserver for reveals (900 ms, 18 px,
  120 ms stagger, once); pinned loop (`position: sticky` container 600 vh + rAF progress → stage index; crossfade; 0.6 s
  smoothing), hover/keyboard also select a stage (buttons with `aria-pressed`, `aria-live="polite"` stage label); marquees
  (CSS, pause on hover and when off-screen); count-ups; orb pointer drift (60 ms lerp); footer wordmark weight/highlight;
  FAQ as `<details>` with height animation; nav pill shrink after the hero. Everything gated by reduced motion and visibility.
- [ ] 5. Orb + wave field as inline SVG (system §8), paused off-screen; static under reduced motion.
- [ ] 6. Mobile composition C13 at <768 (not a reflow of desktop): tabs with scroll-snap, member carousel, stacked pricing.
- [ ] 7. Copy: Orbit copy from the artboards; product name Orbit; remove every Kleo string and `app.kleo.so`/framerusercontent
  URL (`rg -i "kleo|framer" apps/marketing` returns nothing).
- [ ] 8. Budget check (migration §5): transfer ≤ 350 KB compressed, JS ≤ 40 KB.

**Tests:** controller runs Playwright against `http://127.0.0.1:4321` (add `apps/web/e2e/marketing.spec.ts` with its own base
URL, skipped unless `MARKETING_URL` is set): axe 0 serious/critical at 1440 and 390, no horizontal scroll at 390, reduced
motion shows final frames, every in-page nav link resolves to a section, no request to a third-party origin.

**Review focus:** pinned loop usable by keyboard and without JS (stages render as a plain list); orb cost (CPU when idle and
off-screen); placeholders flagged; no Kleo remnants.

---

## Future screens (stubs)

Each stub task is design-complete in screens.md; it starts only when its feature exists (or is planned in the same feature
plan). Each needs its own recon (read-only on app.kleo.so) and feature design before implementation. All inherit the Global
Constraints.

### Task O6: Posts board, list, calendar and editor — screens.md B3, B5, B6 (p05/p19, p08/p21, p15/p28)
- **Depends on:** posts/documents model (ai-core Tasks 8-10 documents + versions), labels, scheduling (ROADMAP §3, LinkedIn
  OAuth; publishing remains disabled until that feature is approved).
- **Recon:** Kleo kanban/list/calendar endpoints, labels, editor (Tiptap) and version history, schedule request shape (read
  only).
- **Files (expected):** `app/(app)/posts/page.tsx` (+ `?view=`), `app/(app)/posts/[id]/page.tsx`, `components/posts/*`,
  `components/editor/*`.
- **Review focus:** board horizontal scroll contained; drag-and-drop keyboard alternative; editor fold line at 210 chars;
  reach/readability chips honest (hide if no model).

### Task O7: Carousel studio — B4 (p07/p20)
- **Depends on:** O6 editor, brand kit model, PDF export service, credits (ROADMAP §6).
- **Recon:** Kleo image/carousel generation, brand theme, logo compositing.
- **Review focus:** 4:5 canvas rendering parity between preview and PDF.

### Task O8: Analytics — B7 (p09/p22)
- **Depends on:** LinkedIn Community Management API access (ROADMAP §7).
- **Recon:** Kleo analytics endpoints, refresh cadence, best-time computation.
- **Review focus:** no numbers without a connection; chart has a text alternative; count-up once per session.

### Task O9: Ideas feed (swipe file, for you, following, hooks, saves) — B11 (p13/p26)
- **Depends on:** content library feature (ROADMAP §4, §5).
- **Recon:** Kleo inspiration feed, following, templates/hooks, saves/spaces APIs.
- **Review focus:** "Use post" opens a chat with the post as context (no copying third-party text into the user's post without
  attribution prompt).

### Task O10: Activities — B8 (p10/p23)
- **Depends on:** activities/goals/streaks feature (ROADMAP §8); feeds the home "Activities" card and the nav count.
- **Recon:** Kleo `/api/user-progress`, routines, milestones/badges, streak rules.
- **Review focus:** home card and nav count switch from empty states to real data without layout shift.

### Task O11: 30-day sprint — B9 (p11/p24)
- **Depends on:** challenge feature (ROADMAP §8); feeds the sidebar sprint card and the home "Today's post" card.
- **Recon:** Kleo `/api/challenge`, `?view=sidebar`, `/api/challenge/strategy-handoff`, format list and examples, catch-up rules.
- **Review focus:** ring progress from real data; "End sprint" confirmation.

### Task O12: Engage (comment queue, leads inbox) — B10 (p12/p25)
- **Depends on:** a data source for target posts and lead signals (to be designed; Kleo equivalent unknown).
- **Recon:** establish whether Kleo has any equivalent; if not, design from first principles. Never automate comments.
- **Review focus:** copy-to-clipboard + "Open on LinkedIn" only; session ring; queue reorder accessible.

### Task O13: Integrations (real connections) — B12 (p14/p27)
- **Depends on:** ROADMAP §10 (LinkedIn/X/Instagram OAuth, MCP server, CLI, Telegram, Composio connectors, API keys, webhooks).
- **Recon:** Kleo `/api/integrations/status`, `/api/linkedin/status`, connector list.
- **Review focus:** secrets never rendered unmasked after creation; status pills reflect server truth.

### Task O14: Notifications — system §6.11
- **Depends on:** a notifications feature (events: approvals, sprint reminders, leads); Kleo `/api/settings/notifications` (known).
- **Review focus:** unread count in the top-bar pill and the mobile tab dot; popover focus management.
