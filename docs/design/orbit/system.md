# Orbit design system (binding)

Status: **binding** for `apps/web` and `apps/marketing`. Replaces the Drafting-table system (`docs/design/system.md`, archived by
O1). Source of truth: the Orbit bundles in `.recon/orbit/pages/pageNN.html` (unpacked: template HTML + inline CSS). Every
rule cites its page as **[pNN]**. Where Orbit's own pages disagree, this doc picks one and says why. Where Orbit is silent it
says **not specified in Orbit** and gives the Brandloop default.

Product name: **Orbit** in all user-visible copy (user decision 2026-10-22); internal package names stay `@brandloop/*`.
Wordmark: lower-case `orbit` [p01].

Page map: p30 design system, p31 motion spec, p01/p17 app home dark/light, p03/p18 chat, p05/p19 editor, p07/p20 carousel,
p08/p21 posts board, p15/p28 calendar, p09/p22 analytics, p10/p23 activities, p11/p24 sprint, p12/p25 engage, p13/p26 ideas,
p14/p27 settings integrations, p16/p29 mobile home, p00/p02/p04 marketing home 1-3, p06 marketing mobile.

---

## 1. Principles

1. Two registers, one system: **cinematic marketing** (ink and paper sections alternating, orb, big type) and a **studio app**
   (dark by default, light on request) [p30 header].
2. One accent family (blue: fill `#4F5FF5`, text `#7C8AFF` dark / `#2E3FE6` light, glow `#2A3BFF`) [p30].
3. Pills for every control (`border-radius: 999px`) [p30 "Radii"].
4. Dark: no drop shadows, borders at 8-12% paper. Light: soft ink shadows, borders only on inputs [p30 "Radii, spacing, shadow"].
5. One easing everywhere: `cubic-bezier(.16,1,.3,1)` [p30 motion catalog, p31].
6. "Nothing moves on load except the hero. Everything else moves once, on first entry, then holds. Hover answers within 150ms."
   [p31 header].

Standing Brandloop constraints that override Orbit (each conflict listed in section 10): no route transitions, no custom
cursor, no sound, `prefers-reduced-motion` honoured, axe 0 serious/critical, no horizontal scroll at 390 px.

---

## 2. Colour tokens

Token names are Brandloop's (Orbit's pages use raw hex). CSS variable = `--<name>`; Tailwind colour = `<name>` via
`@theme inline` (`bg-panel`, `text-text-2`, ...). Dark is the app default [p30 "app default"].

### 2.1 Surfaces and text

| Token | Dark [p30, p01] | Light [p30, p17] | Role (source) |
|---|---|---|---|
| `ground` | `#0E0E10` | `#F5F4F0` | App page background [p30 "Ground"; p01/p17 body] |
| `ground-hero` | `#0A0A0B` | `#0A0A0B` (marketing ink sections only) | Marketing hero/ink sections [p30 "Hero ground"; p00 body] |
| `panel` | `#151517` | `#FFFFFF` | Cards, composer, sidebar sprint card [p30 "Panel"] |
| `panel-hover` | `#1A1A1D` | `#EFEEE9` | Panel hover fill; user chat bubble [p30; p03 bubble `#1A1A1D` / p18 `#EFEEE9`] |
| `inverse` | `#F5F4F0` | `#0A0A0B` | Active segmented tab, chip hover, editor toolbar [p30 "Inverted · chips, toolbar"; p05/p19 toolbar] |
| `on-inverse` | `#0A0A0B` (`#0E0E10` on chips) | `#F5F4F0` | Text on `inverse` [p30, p01 `.chip:hover`] |
| `text` | `#F5F4F0` | `#0A0A0B` | Primary text [p30] |
| `text-soft` | `#C9C8C4` | `#3A3A3E` | Nav labels, chat history rows, body copy in cards [p01/p17 mapping, 131 pairs] |
| `text-2` | `#9A9A9E` | `#5B5B5E` | Secondary text, greeting line 2, card labels [p30 "Text 2"] |
| `text-3` | `#828288` (Orbit `#7A7A80`, see 2.4) | `#6C6C70` (Orbit `#8A8A8E`, see 2.4) | Meta, counts, timestamps, group labels [p01/p17] |
| `icon` | `#8A8A8E` | `#9A9A9E` | Inactive nav icon stroke (decorative, beside a label) [p01/p17 nav svgs] |
| `faint` | `#5B5B5E` | `#8A8A8E` | Non-text only: empty check circles, hairline glyphs [p01 activities circles; p30 "Text 3"] |

### 2.2 Lines

Dark lines are paper `rgba(245,244,240,a)`, light lines are ink `rgba(10,10,11,a)`; the alpha is identical in both themes
(verified across all 13 dark/light page pairs).

| Token | Alpha | Use (source) |
|---|---|---|
| `line-faint` | 0.05 | Week-grid cells, rest-day cards [p11, p15] |
| `line-soft` | 0.06 | Sidebar right border, nav hover fill, mobile nav top border [p01 aside, `.nav:hover`] |
| `line-row` | 0.07 | Active chat-history row and settings sub-nav fill [p03, p14] |
| `line` | 0.08 | Panel borders (dark), chat bubble border, details border [p30 panels, p03] |
| `line-2` | 0.10 | Composer border, pill buttons (32 px), top-bar pills [p01] |
| `line-3` | 0.12 | Chips in chat, icon-button borders [p03 chips, p30 `Add`] |
| `line-4` | 0.14 | Status pills ("4 left", "3 to review"), memory tag [p01, p03] |
| `line-strong` | 0.18 | Ghost CTA border (52 px) [p30 `Schedule`] |
| `line-hover` | 0.20-0.22 | Dark panel hover border (`0.22` on p30 `.paneld`, `0.2` on p03 `.panel:hover`); use 0.20 |
| `line-input` (light) | `#E3E2DC` solid | Light input/icon-circle border [p30 light swatch "Panel", icon circles] |
| `line-paper` (light) | `#ECEBE6` solid | Draft-card header divider (both themes; the card is always paper) [p03/p18] |

Panel top highlight (both themes): `box-shadow: inset 0 1px 0 rgba(245,244,240,0.055)` dark /
`rgba(10,10,11,0.055)` light on `.panel, .card` [p01, p17].

### 2.3 Accent

| Token | Dark | Light | Use (source) |
|---|---|---|---|
| `accent` | `#4F5FF5` | `#4F5FF5` | Primary fill (Send, Get started, Approve, Publish); text on it `#FFFFFF` [p30 "Accent fill · white text"] |
| `accent-hover` | `#5566F7` (Orbit `#6B7BFF`, see 2.4) | same | Fill hover [p30 "Fill hover"] |
| `accent-text` | `#7C8AFF` | `#2E3FE6` | Accent text, dots, rings, active nav icon, chart line [p30 "Accent text · dots, rings" / "AA on paper"] |
| `accent-text-2` | `#8A93FF` | `#3B4CF0` | Small accent labels on panels ("Suggested slot", "Day 1 · In progress") [p08/p21, p11/p24] |
| `accent-tint` | `#C9CEFF` | `#C9CEFF` | Paper-button hover, gradient stops [p30 "Tint"] |
| `cobalt` | `#2A3BFF` | `#2A3BFF` | Glows and gradients only, never text [p30 "Cobalt glow · radial"] |
| `accent-wash-a` | `rgba(124,138,255,a)` | `rgba(46,63,230,a)` | Tinted fills/borders; a ∈ {0.03, 0.06-0.12, 0.3, 0.35, 0.45, 0.5} [mapping across pairs] |
| `selection-mark` | `rgba(124,138,255,0.45)` | same | Highlighted passage in the LinkedIn preview (both themes) [p05/p19] |

Status in Orbit is carried by the accent family plus neutral pills; there is **no red/green/amber** in any Orbit screen.
Destructive and error states are **not specified in Orbit**. Brandloop default: `danger` = `#FF6B5E` dark / `#C8321F` light
(text and 1 px border on a neutral pill; never a fill except the confirm button in a destructive dialog, white text, AA
checked in O1). Keep red to errors and destructive confirmation only.

Brand-mark colours are allowed only inside third-party logos: LinkedIn `#0A66C2`, Instagram gradient
`#F9CE34 → #EE2A7B → #6228D7` [p14/p27].

### 2.4 Deliberate deviations from Orbit values (accessibility)

Computed WCAG contrast (sRGB):

| Orbit value | On | Ratio | Ruling |
|---|---|---|---|
| `#7A7A80` meta (dark) | `#151517` panel | 4.28 | Fails AA for 11-13 px text. Use **`#828288`** (4.77 on panel, 4.55 on `#1A1A1D`). |
| `#8A8A8E` meta (light) | `#F5F4F0` / `#FFFFFF` | 3.12 / 3.44 | Fails. Use **`#6C6C70`** (4.75 / 4.50 on `#EFEEE9`). |
| `#FFFFFF` on `#6B7BFF` hover | | 3.56 | Fails for 13-17 px labels. Use **`#5566F7`** (4.54) plus Orbit's glow `0 10px 28px rgba(79,95,245,0.28)`. |
| `#5B5B5E` "Text 3" (dark) | `#0E0E10` | 2.85 | Not for text. Token `faint`, non-text only. |
| `#9A9A9E` icon (light) | `#F5F4F0` | 2.55 | Allowed only for icons that sit beside a visible label (decorative). Standalone icons use `text-2`. |

Every other text pair passes: `#F5F4F0`/`#0E0E10` 17.5, `#C9C8C4` 11.5, `#9A9A9E` 6.9 (6.5 on panel), `#7C8AFF` 6.0-6.4,
white on `#4F5FF5` 4.90, `#0A0A0B`/`#F5F4F0` 18.0, `#3A3A3E` 10.3, `#5B5B5E` 6.2, `#2E3FE6` 6.4-7.1.

### 2.5 Ambient layers

- **Grain** (both themes) [p01/p17]: absolutely positioned, `pointer-events:none`, SVG `feTurbulence type=fractalNoise
  baseFrequency=0.85 numOctaves=2 stitchTiles=stitch` tile 180x180. Dark `opacity:.07; mix-blend-mode:screen`; light
  `opacity:.05; mix-blend-mode:multiply`. Static (no animation). This is a film grain, not a riso device; it is allowed.
- **Ambient glow**, per screen, behind content [p01]: dark
  `radial-gradient(640px 360px at 58% 0%, rgba(124,138,255,.10), transparent 60%), radial-gradient(700px 420px at 100% 100%,
  rgba(42,59,255,.16), transparent 60%)`; light uses `rgba(46,63,230,.10)` for the first stop and the same cobalt `.16` second
  [p17]. Settings uses one stop `radial-gradient(800px 420px at 80% 100%, rgba(42,59,255,.12), ...)` [p14]. Mobile:
  `radial-gradient(360px 260px at 50% 0%, rgba(124,138,255,.12), ...)` [p16].
- **Avatars and voice orbs** are gradients, not images, when no photo exists: profile
  `radial-gradient(circle at 30% 30%, #C9CEFF, #2A3BFF)`; voice `radial-gradient(circle at 30% 30%, #E8EBFF, #2A3BFF)` [p01].

---

## 3. Theme switching

- Themes: **Dark** (app default), **Light**, **Auto** (follows `prefers-color-scheme`) [p30 light card "Settings · Light / Dark
  / Auto"; p14 settings sub-nav footer].
- Control: three pill buttons at the bottom of the Settings sub-nav, `height:32px; flex:1; font-size:12px`; selected = `inverse`
  fill, weight 500; others transparent with `line-2` border and `text-2` text [p14]. Accessible names "Light theme", "Dark
  theme", "System theme" (Orbit's own `aria-label`s) with `aria-pressed`.
- Implementation: `next-themes` (already a dependency) with `attribute="class"`, `defaultTheme="dark"`, `enableSystem`,
  `themes={["light","dark"]}`, storage key `orbit-theme`, `disableTransitionOnChange`. Token blocks:
  `:root` = dark values, `:root.light` = light values (dark is default so the no-JS paint is dark). `color-scheme` set per theme.
  The profile menu's existing theme item (if any) points at the same setting.
- Persistence: per device (localStorage), **not specified in Orbit**. A per-user server setting is out of scope for O1.
- Marketing has no theme switch: it alternates ink (`#0A0A0B`) and paper (`#F5F4F0`) sections [p30 header, p00-p04].
- Clerk (sign-in/up) follows the app theme: `colorPrimary #4F5FF5`, `colorBackground` = `panel`, `colorForeground` = `text`,
  `colorMutedForeground` = `text-2`, `colorInput` = `ground`, `borderRadius 14px`, fonts Geist; buttons get `999px` via
  `elements`. Not specified in Orbit beyond tokens.

---

## 4. Typography

Faces [p30 "Type"]: **Bricolage Grotesque** (display; variable `opsz` 12-96, `wdth` 75-100, `wght` 200-800) and **Geist**
(UI; variable `wght` 100-900). Self-hosted with `next/font/google` (`Bricolage_Grotesque` with `axes: ["opsz","wdth"]`,
`Geist`), CSS variables `--font-display-face` and `--font-ui`. Marketing self-hosts the same woff2 (latin + latin-ext) in
`apps/marketing/assets/fonts/` (OFL).

Monospace: p30 says "No monospace", yet Orbit uses `ui-monospace,SFMono-Regular,Menlo,monospace` (system stack, no web font)
for a **data register** in every place below. Ruling: allowed only in these roles, always `letter-spacing:0.04em`, 11-12 px,
weight 400:
memory-confirmation tag [p03], editor metric chips (upper case) [p05], analytics delta pills [p09], API key and CLI snippets
[p14], marketing eyebrow labels ("02 · Voice", "DRAFT · IN YOUR VOICE · 09:41", table headers) [p00, p02], dark "Approved"
status chip [p30]. Nowhere else.

Upper-case tracking: only footer column labels [p30 lead] and the hero roles marquee (`letter-spacing:0.22em`, 15 px) [p00],
plus the mono roles above.

### 4.1 Scale

`font-variation-settings` is written exactly; weights are numeric (460 is intentional).

| Step | Face | Size / line-height | Axes, weight | Tracking | Source |
|---|---|---|---|---|---|
| `display` | Bricolage | 112 / 0.9; marketing hero `clamp(64px,9vw,128px)` / 0.9 | `'opsz' 96,'wdth' 88`, 460 | -0.05em | p30, p00 h1 |
| `section` | Bricolage | 72 / 0.92; marketing `clamp(40px,7.2vw,104px)` (loop) to `clamp(40px,4.8vw,68px)` (chapters) | `'opsz' 96,'wdth' 88`, 460 | -0.045em | p30, p00-p04 h2 |
| `greeting` | Bricolage | `clamp(36px,4.4vw,56px)` / 0.98; mobile 36 | `'opsz' 96,'wdth' 90` (mobile `'opsz' 72`), 460 | -0.04em (mobile -0.03em) | p01, p16 |
| `page-title` | Bricolage | 40 / 1 | `'opsz' 72,'wdth' 90`, 460 | -0.03em | p07-p14 h1 |
| `panel-title` | Bricolage | 28 / 1.08 | `'opsz' 48,'wdth' 90`, 500 | -0.03em | p30 |
| `card-title` | Bricolage | 22 / 1.05 | `'opsz' 48,'wdth' 90`, 500 | -0.03em | p01 "Today's post", p05 editor h1, p14 sub-nav title |
| `stat-xl` | Bricolage | 64 / 0.85 | `'opsz' 96,'wdth' 85`, 500 | -0.045em | p30 "2,998,895" |
| `stat` | Bricolage | 44 / 1 (analytics), 40 / 0.9 (panels) | `'opsz' 96,'wdth' 88` / `'wdth' 85`, 500 | -0.03em | p09, p30 |
| `wordmark` | Bricolage | 20 | `'opsz' 32,'wdth' 90`, 600 | -0.03em | p01 |
| `lead` | Geist | 19 / 1.5 (marketing hero 21 / 1.45) | 400 | 0 | p30, p00 |
| `body` | Geist | 15-16 / 1.55 (chat 15 / 1.5-1.55; composer 17 home, 16 thread) | 400 | 0 | p30, p01, p03 |
| `ui` | Geist | 13-14 | 500 labels and buttons; 400 rows | 0 (section headings -0.01em at 18 px) | p30 |
| `meta` | Geist | 11-12 | 400, colour `text-3` | 0 | p30 |

Numbers: `font-variant-numeric: tabular-nums` on counts and the ⌘ hints [p01 nav counts]. p30 states "Numbers −0.06em" tracking
but every Orbit number sample uses -0.03 to -0.045em; use the per-step values above.

---

## 5. Radii, spacing, elevation

- **Radii** [p30]: pills 999px for every control. Cards 14 / 18 / 24 / 28 by size (14: board cards, slide rows, day cards;
  18: home cards, panels, draft card; 22: home composer [p01]; 20: thread composer [p03] and right-rail panels [p07, p09];
  24: design-system/pricing cards, marketing sheet; 28: marketing product shots). Small: 16 (sidebar sprint card [p01]),
  12 (rail icons, details, social logos [p14]), 10 (nav rows [p01]), 8 (chat history rows [p01]).
- **Spacing** [p30]: grid gap 16-20 (app cards 12 [p01], analytics 12 [p09]); section padding 128 (marketing actually uses
  160 top/bottom [p00 `#loop`, `#product`]; use 160 ≥1024 px, 96 at ≤768, 72 at 390); page gutter 24, max width 1328
  [p00]. App main padding `28px 32px 32px` [p07-p14]; top bar `18px 32px` [p01].
- **Elevation** [p30]: dark has no drop shadows except overlays: composer `0 30px 90px rgba(0,0,0,.45)` + inset highlight
  [p01]; draft card `0 24px 70px rgba(0,0,0,.45)` [p03]; editor toolbar `0 16px 40px rgba(0,0,0,.45)` [p05]. Light:
  cards `0 20px 60px rgba(10,10,11,.06)` [p30]; composer `0 30px 90px rgba(10,10,11,.12)` [p17]; draft card
  `0 24px 70px rgba(10,10,11,.10)` [p18]; hover `0 24px 60px rgba(10,10,11,.12)` [p30 `.panell:hover`]. Marketing sheet
  `0 40px 120px rgba(10,10,11,.28)` [p00].
- **Focus ring**: not specified in Orbit. Brandloop default: `outline: 2px solid var(--accent-text); outline-offset: 2px` on
  `:focus-visible` (6.0+ contrast on ground in both themes). The composer uses its own focus treatment (6.4).

---

## 6. Components

All sizes from the cited page. "Hover" values are the CSS in that page's `<style>`; timings normalised per section 7.

### 6.1 Icons [p30 "Icons"]

Custom 20-unit grid, `stroke-width 1.6`, round caps/joins, `fill:none`, drawn at 15-19 px; always flex-centred in a 36-44 px
circle when standalone. Chevrons only for prev/next and disclosure. "No text arrows, no glyph buttons, no arrow on Get
started." The Orbit icon set (extracted paths, to be committed as `packages/ui/src/icons/*.tsx`):

| Name | Path(s) (viewBox 0 0 20 20) | Source |
|---|---|---|
| send | `M3 10 17 3l-4 14-3.5-5.5L3 10z` + `M9.5 11.5 17 3` | p01 |
| plus | `M10 4v12M4 10h12` (stroke 1.7) | p01 |
| close | `M5 5l10 10M15 5L5 15` | p30 |
| more | three dots `circle r=1.4` at x 4.5/10/15.5, `fill=currentColor` | p30 |
| mic | `rect x7 y3 w6 h10 rx3` + `M5 10a5 5 0 0 0 10 0M10 15v2` | p01 |
| pencil (new draft) | `M4 16l1-4 8.5-8.5a1.6 1.6 0 0 1 2.3 2.3L7.3 14.3 4 16z` | p01 |
| posts | `rect x4 y3.5 w12 h13 rx2` + `M7 8h6M7 11h6M7 14h3` | p01 |
| ideas (spark) | `M10 3v2.5M10 14.5V17M3 10h2.5M14.5 10H17M5 5l1.8 1.8M13.2 13.2 15 15M5 15l1.8-1.8M13.2 6.8 15 5` | p01 |
| activities | `circle cx10 cy10 r7` + `M6.8 10.3l2.2 2.2 4.4-4.8` | p01 |
| engage | `M3 10a7 7 0 1 1 3.2 5.9L3 17l1.1-3.2A7 7 0 0 1 3 10z` | p01 |
| analytics | `M4.5 16V9.5M10 16V4M15.5 16v-6` | p01 |
| chevron-up | `M6 12l4-4 4 4` (14 px) | p01 profile footer |
| logo mark | see 6.2 | p01 |

Remaining icons (search, bulb, calendar, chevron-left/right, check, play, copy, undo/redo, bold/italic/strike, lists, emoji,
at) follow the same grid; take paths from p07, p10, p13, p14, p15 when the screen is built. `lucide-react` is retired for app
chrome (O2) and may stay only for icons Orbit does not draw, restyled to `stroke-width 1.6`.

### 6.2 Logo [p01]

`svg 20x20` drawn at 18 px, stroke `accent-text`: `g transform="translate(10 10) rotate(-28)"`: back arc
`M-9 0A9 3.4 0 0 1 9 0` (stroke 1.3, opacity .4), planet `circle r=4.5` (stroke 2.6), front arc `M-9 0A9 3.4 0 0 0 9 0`
(stroke 1.5), moon `circle cx=0 cy=3.4 r=1.7` filled. Followed by the `orbit` wordmark (4.1) with gap 8. Accessible name
"Orbit home". Inside chat avatars the mark is 12 px in a 28 px `panel` circle with a `line-2` border [p03].

### 6.3 Buttons and pills [p30 components]

| Variant | Spec | Hover |
|---|---|---|
| `primary` (CTA) | `min-height 52px; padding 0 24px; radius 999; bg accent; color #FFF; 15px/500` (marketing hero 56 px, 30 px pad, 17 px [p00]) | lift -2px, scale 1.02 (marketing 1.03), bg `accent-hover`, glow `0 10px 28px rgba(79,95,245,.28)` |
| `ghost` | same box, `1px solid line-strong`, `color text` | inverts: bg `inverse`, colour `on-inverse` |
| `paper` (dark) / `ink` (light) | dark: bg `#F5F4F0` text `#0A0A0B`; light: bg `#0A0A0B` text `#F5F4F0` ("Use post") | light hover bg `#2E3FE6` [p30 `.ink:hover`]; dark hover bg `accent-tint` [p30 Tint "paper-button hover"] |
| `pill-sm` (app chrome) | `height 32px; padding 0 12-14px; 1px solid line-2; transparent; 13px` (Notifications, Focus, Rename) [p01, p03] | inverts, lift -1px |
| `pill-md` (app actions) | `min-height 40-44px; padding 0 18-20px; 14px/500` primary or ghost (New post, Select, Schedule, Publish) [p05, p08] | as primary/ghost |
| `send` | 48x48 circle accent (home composer 46x44 pill, thread 42x44) [p30, p01, p03]; aria-label "Send" | primary hover |
| `icon` | 40x40 circle, `1px solid line-3`, transparent (36 px in thread composer) [p30, p03] | inverts |
| `micro` | `min-height 24px; padding 0 9px; 11px/500` inside cards: Approve (accent), Edit/Skip (outline `line-4`) [p01] | inverts |

Press: not specified in Orbit; use `scale(0.98)` for 150 ms. Magnetic spring (`stiffness 300, damping 24`) is marketing CTAs
only [p31 "Springs only on the magnetic buttons"]. Disabled: not specified; use `opacity .4`, no hover.

### 6.4 Chips, status pills, segmented tabs

- **Chip (action)** [p30, p03]: `min-height 32-36px; padding 0 14px; 1px solid line-3; 13px/500; text`. Hover inverts and lifts
  -1px [p03 `.chip:hover`]. First/primary suggestion may be pre-inverted ("Sharpen the hook" on p30).
- **Status pill** [p01]: `min-height 22-24px; padding 0 9-10px; 1px solid line-4; text-soft; 11px/400` ("4 left",
  "3 to review", "High fit", "Draft ready").
- **Accent status** (light) [p30]: `bg rgba(46,63,230,.1); color #2E3FE6; 13px/500`, leading 6 px dot. Dark equivalent is the
  mono "Approved" chip [p30]; prefer the dot variant in both themes with dark `rgba(124,138,255,.12)` / `#7C8AFF` for
  consistency (the dark mono variant is inconsistent with light).
- **Segmented tabs** [p30, p08]: container `padding 4px; gap 4px; radius 999; bg panel` (light: `ground`); item
  `min-height 32px; padding 0 14px; 13px`; selected `bg inverse; color on-inverse; weight 500`; others `text-2`. Use
  `role="tablist"` or a radio group; selected indicator slides with Motion `layoutId` (in-page, allowed).
- **Filter chips** [p12, p13]: chip row with selected = `inverse`; "Add topic" dashed border [p13].
- **Count badge in nav** [p01]: plain `12px text-3 tabular-nums`, right aligned, no pill.

### 6.5 Composer [p01, p03, p16, p30]

- Box: `bg panel; 1px solid line-2; radius 22px (home) / 20px (thread) / 20px (mobile); shadow per 5`. Max width 760 home,
  736 thread (offset 44 px left to align with the reply column) [p01, p03].
- Textarea: transparent, no border, `17px/1.5` home (`16px` thread/mobile), padding `22px 24px 0` home / `18px 20px 0` thread,
  placeholder "Give Orbit a thought, a link or a voice note…" in `text-3`. Visually hidden `<label>` [p01].
- Footer row `padding 14px 16px 16px`: left group `gap 8px`: Add files (icon button), voice pill (24 px voice orb + "Your
  voice", `height 40; padding 0 14px 0 8px; 13px/500`), Dictate (icon button); right: Send.
- **Focus glow** [p01 `.composer`]: `@property --a {syntax:'<angle>'; inherits:false; initial-value:0deg}`; `::before` at
  `inset:-6px`, `border-radius:inherit`,
  `conic-gradient(from var(--a), #7C8AFF 0deg, #2A3BFF 90deg, #C9CEFF 170deg, #4F5FF5 250deg, #7C8AFF 360deg)` (light: first and
  last stop `#2E3FE6`), `filter: blur(20px)`, `opacity 0 → .42` on `:focus-within` over 500 ms, `animation: spinglow 5s linear
  infinite` (`--a` 0→360deg), `z-index:-2`; `::after` repaints the box background at `z-index:-1`; `isolation:isolate`.
  Focus border `rgba(124,138,255,.45)` + `box-shadow 0 0 0 1px rgba(124,138,255,.3)` (light `rgba(46,63,230,…)`).
  Reduced motion: aura shows statically at .42 (no spin). Pause the spin animation when the composer is not focused
  (`animation-play-state: paused` unless `:focus-within`) so it costs nothing at rest.
- Marketing sheet variant: `bg #F5F4F0; border #F5F4F0; radius 18`, white icon buttons, 48 px circular send [p00].

### 6.6 Panels and cards

- **Panel** [p30, p01]: `bg panel; radius 18; padding 20`; dark border `1px solid line` (home cards omit the border and rely on
  the inset highlight). Hover: dark lift -3px (app) / -4px (system page) with `bg panel-hover` and border `line-hover`; light
  lift with shadow `0 24px 60px rgba(10,10,11,.12)`. p31 says panels lift 8px; app pages use 3px. Ruling: **app 3px, marketing
  tiles 8px** (p31 "Panels and tiles lift 8px" applies to marketing day cards [p00 `.day`]).
- Clickable panels are links (`<a>`) with the whole card as hit area [p01].

### 6.7 Progress ring [p01, p30]

- Sidebar: `viewBox 0 0 100 100`, 52 px; track `r=46 stroke line-2 width 6`; progress `stroke accent-text width 6 round cap`,
  `transform rotate(-90 50 50)`, `stroke-dasharray 289` (2πr = 289.0); centred day number Bricolage 26/500 in `text`.
  `role="img"` `aria-label="Sprint progress, N of 30"`.
- System sample: `viewBox 0 0 60 60`, 56 px, `r=25`, width 4, dasharray 157.
- Draw: `stroke-dashoffset` from C (empty) to `C × (1 − progress)` over 1.6 s out-expo, 0.5 s delay [p01 `.ring`]. (p01's
  keyframe animates to `0`, a full ring, which is a mock bug; p30 animates 157 → 52, i.e. to the progress value. Use p30.)
  Reduced motion: render the final offset.
- Engage session ring: 12 m label inside, same recipe [p12]. Mobile header uses a 16 px ring in a pill [p16].

### 6.8 Stat numbers [p09, p30]

Label `13px text-2` → number (`stat`) → delta pill (mono, `line-4` outline, `text-soft`, 12 px, `padding 4px 10px`).
Count up over 1.2 s on first view per session [p30 "big numbers count up over 1.2s", p31 "Numbers count up only on first visit
per session"]. Reduced motion: final value. Must have `aria-live="off"` and the final value in the DOM text for screen readers
(render the final string in a visually hidden span; animate an `aria-hidden` copy).

### 6.9 Sidebar [p01]

- `flex 0 0 240px; padding 18px 12px; border-right 1px solid line-soft`.
- Header: logo + `⌘K` search pill (`height 32; padding 0 10px; 1px solid line-2; 12px text-2`; aria-label "Search").
- **Sprint card**: `panel` link, `radius 16; padding 16; gap 14`, ring (6.7) + three lines: "30-day sprint" (11 px text-2),
  title "Day 2 · The contrarian take" (14/500), "0 of 22 posted" (11 px text-2). Active (on the sprint page) adds
  `1px solid rgba(124,138,255,.5)` [p11].
- **Nav** (`aria-label` Orbit "App"; Brandloop keeps "Main" for test stability): rows `min-height 38; padding 0 10px; gap 12;
  radius 10; 14px text-soft`; icon 17 px `icon` colour; active `bg line-soft fill (rgba(…,.06)); color text; 500;
  aria-current="page"`, active icon `accent-text`; right-aligned count or shortcut (`12px text-3 tabular-nums`, e.g. ⌘J, 61, 4, 7).
  Hover: `text` colour + `line-soft` fill, 150 ms. Active indicator slides between rows (`layoutId`).
  Items: New draft (⌘J), Posts, Ideas, Activities, Engage, Analytics [p01].
- **Chat history**: `margin-top 22; 13px`; group labels `11px text-3` ("Today", "Last 7 days", "Last 30 days") with
  `margin 14px 12px 6px`; rows `padding 8px 12px; radius 8; text-soft; ellipsis`; active row `bg line-row; color text`
  [p03]; "See all chats" `12px text-3`.
- **Profile footer**: `margin-top:auto; padding 12px 10px 4px`; 32 px gradient avatar, "Your profile" (13/500) / "Personal
  workspace" (11 px text-3), chevron-up 14 px. Opens the profile menu (switch profile, add profile, theme, sign out).
- **Rail variant** [p13, p14]: `flex 0 0 72px; padding 18px 0; gap 8`; 40x40 icon links `radius 12; text-2`; active
  `bg accent-text` (dark `#7C8AFF` fill with dark icon) [p13 Ideas active]; avatar at bottom with ring
  `0 0 0 2px ground, 0 0 0 4px accent-text` when settings is active [p14]. Used by sectioned screens (Ideas, Settings,
  Calendar) and as the collapsed state of the full sidebar.
- **Section sub-nav** [p13, p14]: `flex 0 0 220px; padding 22px 12px; gap 4; border-right line-soft`; title `card-title`;
  group labels `11px text-3`; rows `padding 9px 10px; radius 10; 14px text-soft`; active `bg line-row`, `text`, 500, with a
  6 px `accent-text` dot.

### 6.10 Top bar [p01, p03]

`padding 18px 32px; flex space-between`. Left: breadcrumb `13px text-3` ("Home") or chat title `h1 15px/500` + timestamp
`12px text-3` [p03]. Right: pill-sm buttons. Home: "Notifications" pill with count `12px text-3` [p01]. Chat: Focus
("Open draft full screen"), Rename ("Rename chat"), More ("More actions") [p03].

### 6.11 Notifications

Orbit shows only the trigger pill "Notifications 1" [p01]. The panel is **not specified in Orbit**. Brandloop default: a
popover anchored to the pill, `panel` bg, radius 18, width 360, shadow per theme, list rows like chat-history rows with a 6 px
`accent-text` unread dot, empty state "Nothing new" in `text-2`. No backend exists yet: render the pill without a count and the
empty state until a notifications feature lands (O14 stub).

### 6.12 Draft card with LinkedIn preview [p03, p18]

Always paper, in both themes: `<a>` to the editor, `radius 18; overflow hidden; bg #F5F4F0 (light theme #FFFFFF); color
#0A0A0B`; shadow per 5. Header strip `padding 12px 18px; bg #FFFFFF; border-bottom 1px solid #ECEBE6; 13px`: title (500) left,
meta right in `#8A8A8E` → use `#6C6C70` ("Draft · 168 / 3,000 · open in editor"). Body `padding 20px 22px 22px; gap 14`:
36 px gradient avatar + "Your name" (14/500) / "Just now · LinkedIn preview" (12 px); paragraphs `15px/1.5`, gap 10; the fold
line ("…more") in the meta colour. Hover: lift -3px and stronger shadow [p03 `.panel:hover`].

### 6.13 "Worked through N steps" [p03]

Native `<details>`: `1px solid line; radius 12; bg panel; padding 0 14px`. `<summary>` `list-style:none; min-height 38; gap 10;
13px text-2`: 12 px chevron (rotates 90° when open, 400 ms), "Worked through 2 steps", duration right ("3.1s", 12 px). Body
`padding 4px 0 14px 20px; 13px/1.6 text-2`: steps joined with " · " (p03) — Brandloop renders one row per step (tool label).

### 6.14 Memory-confirmation tag [p03]

Inline pill after the assistant text: `padding 6px 12px 6px 8px; radius 999; 1px solid line-4; color text-soft; mono 12px
letter-spacing .04em` — "Voice profile · Length rule added". Pattern `<Area> · <change>`. Brandloop adds a leading 6 px
`accent-text` dot (the 8 px left padding in Orbit implies one) and links to the memory/voice screen.

### 6.15 Home cards [p01, p16]

Grid `repeat(auto-fit, minmax(min(220px,100%),1fr)); gap 12; margin-top 10; max-width 760`. Each is a 6.6 panel `min-height 150;
padding 20`; header row `12px text-2` label left, accent value or status pill right; footer meta `12px text-2 margin-top:auto`.
1. Today's post: label + "Day 2" (`accent-text`), title `card-title`, meta "Video · 2 examples · ~20 min".
2. Activities: label + "4 left" pill, three rows with 14 px `faint` circles, meta "Resets in 7h".
3. Your week: label + "3 to review" pill, rows "Tue · The checklist" + micro button (Approve / Edit / Skip), meta "From your
   plan, your voice and last week's numbers" (`text-3`).
Mobile [p16]: stacked rows `radius 16; padding 16`, with an inline "Open" primary micro pill; third card "Latest draft".

### 6.16 Other recurring pieces

- **Board column** [p08]: header `dot + name + count + plus button`; cards `radius 14; padding 16; gap 10` (title 14/500,
  excerpt 13 `text-2`, footer status + age 11 px); "Add a post" dashed `line-3`; suggested slot card dashed
  `rgba(42,59,255,.6)` with `accent-text-2` label.
- **Toggle** [p00, p07]: `28x16` pill, on `accent`, off `#2A2A2D` (dark) — light off value not specified (use `#D9D8D2`).
- **Progress bar** [p10]: 4-6 px track `line-2`, fill `accent`, radius 999.
- **Heatmap** [p09]: cells radius 4-6, `accent-wash` steps.
- **Line chart** [p09]: stroke `accent-text` 2.5 px with `feGaussianBlur stdDeviation 4` glow, area fill linear gradient
  `accent-text` .28 → 0, previous period `text-3` 1.5 px; draws with dashoffset over 2.4 s after .3 s (p09) — normalise to
  1.2 s [p31]. Charts must offer a table or `aria-label` summary.
- **Day strip** [p10]: 7 tiles `radius 14`, today `accent` fill with white text, prev/next round chevron buttons.
- **Formatting toolbar** [p05]: `inverse` pill `padding 6; gap 2; 13px`, `role="toolbar" aria-label="Formatting"`, view
  segmented control inside.
- **Dashed "coming soon" card** [p14]: `1px dashed line-3`, `text-2`, "Coming soon" status pill.

---

## 7. Motion

Stack. Orbit p31: Framer Motion (components), GSAP ScrollTrigger (pins), Lenis (scroll), SplitType (lines), one R3F canvas
(orb). Brandloop ruling: **app** uses `motion` (already, via `MotionProvider` with `LazyMotion` + `m.*`) and CSS keyframes;
no GSAP, no SplitType (headline lines are authored as spans), no R3F in the app. **Marketing** is a Next.js app (ruling A16): `motion` + Lenis in client components, otherwise static rendering; was: vanilla JS
(IntersectionObserver + one rAF scroll loop) and CSS; Lenis optional (vendored from the workspace's pinned `lenis` dist);
the orb is the SVG version (section 8). GSAP/R3F are open decisions (preflight).

### 7.1 Tokens [p31]

| Token | Value | Use |
|---|---|---|
| `--ease-out` / `easeOut` | `cubic-bezier(.16,1,.3,1)` | every reveal and hover |
| linear | `linear` | marquees, orb spin, composer aura only |
| `springMagnet` | `{ stiffness: 300, damping: 24 }` | marketing magnetic CTAs only |
| `--dur-hover-color` | 150 ms | colour/background/border on hover |
| `--dur-hover` | 400 ms | hover transforms, panel lift, collapse/expand |
| `--dur-reveal` | 900 ms | fade-rise reveals |
| `--dur-line` | 1200 ms | headline line reveals, chart draws, count-up |
| `stagger.line` | 80 ms | between headline lines |
| `stagger.panel` | 120 ms | between panels (app route-entry stagger 80 ms is not used, see 7.3) |
| distances | 2 / 8 / 18 / 112% | button lift / panel+tile lift / reveal rise / headline line rise |
| scale caps | 1.03 buttons, 1.01 product shots | |

Orbit's page CSS uses 0.25-0.35 s for hovers and 0.8 s / 14 px for app fades [p01]; p31 ("for the Next.js build") wins.
Exception kept from source: the hero headline lines use 1.1 s with 120 ms stagger [p00, p30 "1.1s, 120ms stagger"] vs p31
"1200ms, 80ms between lines"; use **1.2 s, 120 ms** for the three-line hero (p31 hero row says "120ms stagger").

### 7.2 Catalog

| Trigger | What moves | Timing | Source |
|---|---|---|---|
| App first paint (hard load only) | Greeting, composer, cards fade-rise 18 px, stagger 120 ms (composer +120 ms, cards +340 ms on p01) | 900 ms out-expo | p01 `.fade`, p31 |
| Ring first view | dashoffset draw | 1.6 s, delay .5 s | p01, p30 |
| Stat first view per session | count up | 1.2 s | p30, p31 |
| Chart first view | line draws, area fades | 1.2 s | p31 |
| Hover button | lift 2 px (app 1 px), scale ≤1.03, colour 150 ms | 400 ms | p30, p31 |
| Hover chip | invert, lift 1 px | 150 ms colour / 400 ms transform | p01 |
| Hover panel | lift 3 px app, 8 px marketing tile, border/shadow | 400 ms | p01, p31 |
| Hover link (marketing) | underline scales from left; p30 also says "Links slide 4px with a blue dot" | 400 ms | p00 `.link`, p30 |
| Composer focus | aura fades in, rotates 5 s/turn | 500 ms | p31 |
| Sidebar active | indicator slides (`layoutId`) | spring `springLayout` (existing) | p31 |
| Segmented tab | selected pill slides (`layoutId`) | 400 ms out-expo | p30 (pattern) |
| Details/FAQ open | height animates, chevron 90° / plus 45° | 400 ms | p31 |
| Editor typing | reach chip number tween; fold line fades in past 210 chars | 400 ms | p31 |
| Publish | button fills, check draws, sheet scales .98 then settles | 400 ms, check 600 ms | p31 (future O6) |
| Engage | queue reorder (`Reorder`), copy progress ring, done cards collapse to 56 px | 1.2 s ring, 400 ms collapse | p31 (future) |
| Marquee | translateX -50% loop, pause on hover | 32 / 40 / 46 s linear | p00, p31 |

### 7.3 Rulings against Brandloop constraints

- **Route change**: p31 specifies "Content fades 150ms out, new screen fades 300ms in with panels rising 8px". **Dropped**:
  routes switch instantly. Entry fade-rise plays only on the document's first paint (CSS animation on server-rendered markup),
  never on client navigation (gate with a `data-first-paint` attribute removed after the first `requestAnimationFrame`, or by
  scoping the keyframes to `html:not([data-navigated])`).
- **Custom cursor** [p31 "Cursor", upgrade #8]: dropped. Native cursor only.
- **Opt-in sound** [p31 #12]: dropped.
- **Grain/chromatic aberration post pass** [p31 #11]: dropped (CSS grain only).

### 7.4 Reduced motion

`@media (prefers-reduced-motion: reduce)`: Orbit's rule is `*{animation:none!important;transition:none!important}` [all
pages]; p31 says "turns every transform into a fade". Ruling: transforms removed, opacity transitions kept at 150 ms; looped
animations (marquee, orb spin, wave lines, aura spin, caret blink, word carousel) stop at a static frame; count-ups and ring/
chart draws show the final value; headline lines render in place. `MotionProvider` already sets `reducedMotion="user"`.
Lenis is disabled under reduced motion (existing `SmoothScroll` behaviour).

### 7.5 Off-screen and cost rules

Any infinite animation (orb, marquee, wave, ring spin on pricing [p31 "starts spinning only when in view"], composer aura)
runs only while visible (`IntersectionObserver` toggles `animation-play-state`) and while the tab is visible.

---

## 8. Orb (marketing hero) [p00, p30, p31]

- Today (Orbit's own build): an SVG, 680x680 at `right:48px; top:96px` (1440 frame), `viewBox 0 0 600 600`,
  `filter: drop-shadow(0 60px 90px rgba(42,59,255,.35))`. Clip circle r 268. Inside: `#0A0A0B` base and a group of ten
  concentric stroked circles (r 330/296/262/228/194/160/128/96/64 with strokes `#F5F4F0/#2A3BFF/#0A0A0B/#C9CEFF/#1A1A1E/
  #F5F4F0/#2A3BFF/#0A0A0B/#7C8AFF`, widths 16-28, plus a filled r 34 `#F5F4F0` core) rotating 48 s linear (`.spin`,
  origin 300 300) through `filter #liquid`: `feTurbulence fractalNoise baseFrequency .011 numOctaves 3 seed 9`, animated
  `baseFrequency .009;.016;.009` over 16 s, into `feDisplacementMap scale 110 R/G`. Overlays: radial `sheen` (white .95 at
  32%/26% → black .55) and a 2 px rim stroke (`#F5F4F0` .9 → transparent → `#2A3BFF` .8). Float `translateY 0 → -18px`
  7 s ease-in-out. Pointer: translates ±18 px x / ±12 px y (`(mx-.5)*36`, `(my-.5)*24`) [p00 script]; p31 says 36 px max with
  60 ms lag, use the script's values with a 60 ms lerp.
- Production per Orbit: one WebGL "liquid chrome" canvas (R3F), and upgrade #1 (a persistent ring-and-nodes scene) [p31].
  **Not in v1** (open decision). If adopted later: lazy-load after `load` + idle, `IntersectionObserver` pause off-screen,
  `prefers-reduced-motion` shows a static poster, DPR capped at 1.5, fallback to the SVG.
- SVG cost: `feTurbulence` + `feDisplacementMap` animated every frame is expensive. Run the rotation and frequency animation
  only while the hero is visible; under reduced motion render the filter once with no animation. On ≤768 px, scale to
  `min(92vw, 420px)` and place below the headline (p06 layout).
- Hero background wave field [p00 `.wave`]: two groups of 18 hairline bezier paths (stroke `#F5F4F0`, widths 0.5-1.52,
  opacity 0.10-0.90), dash `1100 700` flowing (`stroke-dashoffset 0 → -1800`, 20-30 s per path, negative begins),
  whole layer `breathe` .45 ↔ .7 over 9 s. Same visibility and reduced-motion rules.

---

## 9. Layout and breakpoints

Orbit draws 1440 desktop and 390 mobile artboards only; **intermediate breakpoints are not specified in Orbit**. Brandloop:

| Width | App | Marketing |
|---|---|---|
| ≥1280 | sidebar 240 + main; right rails (carousel 260, calendar drafts 270, engage 450) | 1328 max, gutter 24 |
| 1024-1279 | sidebar 240; right rails stack below main | two-column chapters stay |
| 768-1023 | sidebar collapses to the 72 px rail (6.9) | chapters stack, orb shrinks |
| <768 | no sidebar; mobile header (logo, sprint pill, search) + bottom tab bar [p16] | p06 layout |

Mobile tab bar [p16]: `padding 10px 12px 28px; border-top line-soft; bg ground`; five 48x44 links `radius 14`, icons only with
`aria-label` (Home, Posts, Ideas, Activities, Analytics); active `bg accent-text; color ground; box-shadow 0 0 24px
rgba(124,138,255,.35)`; unread dot 7 px `accent-text` at top-right. The existing drawer ("Open navigation") stays reachable for
the full nav (chat history, settings) from the header; the tab bar is additive.

No horizontal scroll at 390: every grid uses `minmax(min(Xpx,100%),1fr)` as Orbit does [p01, p09, p14].

---

## 10. Orbit-vs-Brandloop conflict register

| # | Orbit says | Brandloop rule | Ruling |
|---|---|---|---|
| C1 | Route fade 150/300 ms [p31] | no page transitions | dropped (7.3) |
| C2 | Custom cursor [p31] | native cursor | dropped |
| C3 | "No monospace" [p30] vs mono data chips everywhere | Drafting banned mono | mono allowed in the listed data roles only (4) |
| C4 | `#7A7A80`, `#8A8A8E`, `#6B7BFF` | axe 0 serious | adjusted values (2.4) |
| C5 | GSAP, SplitType, R3F [p31] | bundle budget, release-age policy | not in v1; vanilla + motion (7, preflight) |
| C6 | App sidebar nav `aria-label="App"` [p01] | e2e uses "Main" | keep "Main" |
| C7 | Sound [p31 #12] | not requested | dropped |
| C8 | p31 upgrade #3 "visible hairlines on paper, left-rail counter" | Drafting hairlines removed | allowed only on marketing (02 / 06 counter in the loop section [p00]) |
| C9 | Panels lift 8 px [p31] vs 3 px [p01] | | app 3, marketing 8 |
| C10 | Ring keyframe to 0 [p01] | | p30 behaviour (to progress) |
