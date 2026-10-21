# Orbit screens

One section per Orbit artboard: layout, components (by `system.md` section number), the data each element needs, interactions,
and the Brandloop route/feature it maps to. **Built** = the feature exists in Brandloop today (data + API); **Restyle** = the
screen exists and only its skin changes; **Future** = Orbit shows a feature Brandloop has not built (needs the feature first and,
where marked, Kleo recon). Recon of `app.kleo.so` follows the standing rule: read anything, never publish, schedule or repost to
LinkedIn. Existing recon: `.recon/kleo-bundle-2026-10-21`, `.recon/kleo-bundle-chat-2026-10-21`, `docs/features/*/recon.md`.

Copy: Orbit's copy is the target copy, with "Orbit" as the product name. Sample data in the artboards (names like Lena Marsh,
numbers like 61 posts) is never shipped; every element below states its real source or its empty state.

Shell legend: **S1** full sidebar 240 (6.9) + main; **S2** 72 px rail + 220 px section sub-nav + main; **S3** editor shell
(400 px chat panel + canvas, no sidebar); **M** mobile header + tab bar.

---

## A. App shell (every screen) [p01, p03, p13, p14, p16]

| Element | Data | Source today | Empty / fallback |
|---|---|---|---|
| Logo → `/` | none | | |
| ⌘K pill | opens existing `CommandPalette` | Built | |
| Sprint card | challenge day, title, posted count, progress | **Future** (O11, `/api/challenge?view=sidebar` in Kleo) | Card reads "30-day sprint" / "Not started" / "Start when you're ready", ring at 0, links `/challenge` |
| Nav: New draft (⌘J) | none | `/` | |
| Nav: Posts + count | posts total | **Future** (no posts table) | count hidden |
| Nav: Ideas | none | `/ideas` | |
| Nav: Activities + count | tasks left today | **Future** (O10) | count hidden |
| Nav: Engage + count | queue size | **Future** (O12) | count hidden; route is a stub page |
| Nav: Analytics | none | `/analytics` stub | |
| Chat history | `GET /api/history`, grouped (`groupChatsByDate`) | Built (Task 7 `ChatHistory`) | group labels map: Today, Yesterday, Previous 7 days, Previous 30 days, Older, Pinned (Task 7 labels win over Orbit's "Last 7 days" wording, see migration §4) |
| Profile footer | current profile name, workspace label, avatar | Built (`account-context`) | gradient avatar when no photo; "Personal workspace" when the team has one member, else team name |
| Top bar right: Notifications | unread count | **Future** (O14) | pill without count; popover "Nothing new" |
| ⌘J | focus composer / go to `/` | new shortcut | |
| ⌘B collapse | collapses S1 to the rail | Built | |

Interactions: hover 150 ms colour; active indicator slides (`layoutId`); routes switch instantly (no fade). Mobile (M): header
logo + sprint pill (16 px ring, "Day 2") + search button; bottom tab bar Home / Posts / Ideas / Activities / Analytics; the
existing drawer remains for chat history and settings (open decision in preflight).

---

## B. App screens

### B1. Home, new chat — p01 (dark), p17 (light), p16/p29 (mobile). Route `/`. **Restyle + new cards**

Layout: S1. Main column centred vertically and horizontally, `max-width 760`, gap 26. Top bar: breadcrumb "Home", Notifications.

| Element | Component | Data | Source / empty state |
|---|---|---|---|
| Greeting h1 "Good evening." + line 2 "What are we putting out there?" (`text-2`) | `greeting` type | time of day (morning < 12, afternoon < 18, evening) in the profile's timezone; first name optional (Orbit has none) | Built (profile timezone in settings). Single `<h1>`; accessible name "Good evening. What are we putting out there?" |
| Composer | 6.5 | voices list + selected voice (`listVoices`, `getSelectedVoice`) | Built (Task 7 `HomeChat` → `Composer`). Voice pill shows the selected voice name when one is chosen, "Your voice" otherwise; aria-label stays "Change writing style" |
| "Ways to start" chips (Brandloop addition, see preflight D4) | 6.4 chips, p00 sheet row pattern | `QUICK_LINKS` (5) | Built (Task 7) |
| Card 1 "Today's post" | 6.15 | sprint day, format title, format meta | **Future** (O11). Empty: label "Today's post", title "Start the 30-day sprint", meta "One proven format every weekday", links `/challenge` |
| Card 2 "Activities" | 6.15 | 3 tasks, left count, reset time | **Future** (O10). Empty: "Activities", text "Daily goals arrive with Activities", no fake rows |
| Card 3 "Your week" | 6.15 | planned posts this week with Approve/Edit/Skip | **Future** (posts, O6). Real data today: the strategy (`/strategy`): show "Your plan" with the next three series/format slots from the saved strategy (titles only, micro button "Open" → `/strategy`); no strategy: "Build your strategy" → `/strategy` |

Interactions: first-paint fade-rise (greeting, composer +120 ms, cards +340 ms); composer focus aura; Enter sends (Task 7
`HomeChat` swaps to `ChatView`). Mobile p16: greeting 36 px, composer rows 3, stacked cards with "Open" pill; tab bar.

### B2. Chat thread with a draft — p03, p18. Route `/chat/[id]`. **Restyle on top of Task 7**

Layout: S1 with the active chat highlighted in history. Top bar: chat title `h1` (15/500, ellipsis) + "Today · 03:45 PM";
pills Focus / Rename / More. Thread column `max-width 780`, gap 28, `padding 12px 32px 0`; composer docked bottom (6.5 thread).

| Element | Component | Data | Source |
|---|---|---|---|
| Assistant avatar | 28 px logo circle (6.2) | | |
| Draft card | 6.12 | document title, char count / 3,000, profile name + avatar, post text, link to editor | **Future** (Task 8 documents, Task 9 side panel; editor O6). Until then assistant markdown renders as plain text messages |
| Suggestion chips | 6.4 | post-reply chips | **Future** (Task 14) |
| User bubble | `panel-hover` bg, `line` border, radius `18 18 4 18`, max 60%, 15/1.5 | message text | Built |
| "Worked through N steps" | 6.13 | collapsed tool runs (`collapseToolRuns`, ≥3 parts) and labels (`toolLabel`) | Built (Task 7); Orbit shows it for 2 steps too: show the collapsible for every run of ≥1 tool part after O4 (decision D6) |
| Assistant text | `body` 15/1.55 | markdown | Built |
| Memory tag | 6.14 | memory tool result (saveMemory/updateMemory → "Memory · Saved: …", voice rule → "Voice profile · Length rule added") | Built data (Task 5 memory tools); tag is new UI in O4 |
| Rename / More (pin, delete) | pills + Radix menu | `PATCH/DELETE /api/chat/[id]` | Built (Task 7 row menu); header pills reuse it |
| Focus | opens draft full screen | **Future** (Task 9) | hidden until then |

Interactions: messages fade-rise only on first paint; streaming text appears live; Stop replaces Send while busy; Enter/
Shift+Enter as Task 7.

### B3. Post editor — p05, p19. Route `/posts/[id]` (new). **Future (O6)**

Layout: S3. Left `aside` 400 px "Chat with Orbit" (close button), conversation about the post (proposal cards "Replacing this
passage" + three alternatives with Use buttons, "Write my own replacement"), chips, composer. Right: header (title 22 px,
"Updated 1h ago · Draft · 435 / 3,000", mono chips REACH 9K TO 14K / READABILITY · GRADE 6, undo/redo/copy, Schedule, Publish);
formatting toolbar (inverse pill; Mobile / Tablet / Desktop / Hook only); LinkedIn preview sheet (white, radius 20, fold line
"…see more · fold line on mobile", highlighted passage `selection-mark`, Add a visual / Make a carousel dashed buttons, reactions
row, Like/Comment/Repost/Send); first-comment row ("Posts 2 min after"); actions Swap hook · 3 options / Swap ending / Request
approval.

Data: document (Task 8), versions and proposals (Task 10), reach estimate and readability (new), schedule + publish (LinkedIn
OAuth, ROADMAP §3). Recon: Kleo post editor (Tiptap), `/api/posts/*`, version history, "regenerate a single line", publish/
schedule request shapes **read-only** (never trigger). Reach estimate: Kleo has none known; Orbit-original.

### B4. Carousel studio — p07, p20. Route `/posts/[id]/carousel`. **Future (O7)**

Layout: S1 (Posts active). Header: eyebrow "Carousel studio · from "<post>"", h1 page-title, brand-kit switch (Ledgerly kit /
Personal as radio pills), Export PDF, Attach to post. Grid `250px | 1fr | 260px`, gap 12: slide list (rows radius 14, 4:5
thumbs, active border `rgba(124,138,255,.5)`, "Add slide" dashed); canvas (4:5 slide, radius 20, dots pager); right rail
panels: Template (6 swatches), Brand kit (4 colour dots, Display/Body fonts, "Logo on slides" toggle), Rewrite slides chips
(Fewer words / Add a stat per slide / Stronger last slide) + note "Slides follow your voice rules. Under 12 words each."

Data: post text → slides (LLM), brand kit (new model: colours, fonts, logo), PDF export (server render). Recon: Kleo carousel/
image generator and brand theme (ROADMAP §6 "Brand theme, logo compositing"), credits.

### B5. Posts board — p08, p21. Route `/posts`. **Future (O6)**

Layout: S1. Header: h1 "Posts 61" (count `text-3`), segmented Board/List/Calendar, search input (pill, 280 px), "All labels"
dropdown pill; right Select (ghost) and New post (primary). Horizontal columns 272 px, gap 16, scroll-x inside the board only
(page never scrolls horizontally): All posts, Ideas, Draft, Scheduled, (more). Column header dot colour: all `text`, ideas
`accent-text`, draft `faint`, scheduled `cobalt`. Cards 16.6; suggested-slot card dashed cobalt "Suggested slot · Wed 21, 9:00 /
Day 2 · The contrarian take / Drag here to schedule".

Data: posts with status, labels, updated time, excerpt; sprint suggestion. Interactions: drag between columns (Motion
`Reorder` or dnd), first-paint column stagger 70 ms (Orbit `animation-delay .05/.12/.19…`; normalise to 120 ms). Recon: Kleo
kanban/list/calendar + labels endpoints (ROADMAP §3).

### B6. Posts calendar, week — p15, p28. Route `/posts?view=calendar`. **Future (O6)**

Layout: S2 rail (Posts active, no sub-nav). Header: "Posts" title, segmented (Calendar selected), "October 2026" (year
`text-3`), prev / Today / next, timezone "GMT+5:30 · Asia/Calcutta", Week dropdown, All labels, New post. Grid panel radius 20:
time column + 7 day columns, hour rows 64 px, today column tinted `accent-wash .03` with "Today" accent badge; suggested slot
dashed. Right panel 270 px "Drafts 50" + "Drag onto a slot", draft rows (title, "Sprint · Day 2" accent or "Edited 1h ago"),
"44 more drafts".

Data: scheduled posts, drafts, profile timezone (Built), suggested slots (best-time model, future analytics). Recon as B5.

### B7. Analytics — p09, p22. Route `/analytics`. **Future (O8)**

Layout: S1. Header: h1, status line (6 px accent dot) "LinkedIn connected · official API · refreshed 2h ago" + "Sample data"
pill; segmented 7/30/90 days; "Who engaged · 212" pill, Compare, Export CSV. Row of 4 stat panels (6.8: Impressions, Reach,
Engagement rate, New followers with mono deltas). Below: chart panel "Impressions over time" (This period / Previous legend,
16.6 line chart, x labels) and right column: Top posts (title, reactions · comments, value in accent for #1), Best time to post
heatmap (Mon-Fri × 6-16 h; "Wed · 8 AM").

Data: LinkedIn Community Management API (ROADMAP §7, apply for access early). Until connected: an honest "Connect LinkedIn"
empty state; the "Sample data" pill is only allowed if we render a clearly labelled demo, otherwise no numbers. Recon: Kleo
analytics endpoints and refresh cadence.

### B8. Activities — p10, p23. Route `/activities`. **Future (O10)**

Layout: S1. Header h1 + "Add activity" primary. Row 1 (3 panels): Streak (stat-xl "0", "day streak · 0 of 5 posts this week",
5-segment bar, helper text; cobalt glow corner), This week's goals (4 progress rows: Publish 5 posts 0/5, 50 comments, 10 DMs,
50 connection requests; note "Posts you publish outside Orbit count too, synced from LinkedIn once a day"; Edit), Milestones
(4 dashed circular badges, "Next: First post · 1 to go", All badges). Day strip (16.6) with prev/next. Row 2: Getting started
6 of 8 (progress bar; checklist rows with check circles, struck-through done items, action pills Build / Watch / Open / Set it
up) and Today Wed 21 Oct ("4 left · resets in 7h"; task rows with title, one-line rationale, Draft action).

Data: user progress (Kleo `/api/user-progress`), goals, streaks, milestones, daily routines; checklist maps to real Brandloop
onboarding steps (strategy built, knowledge connected, voice learned, first post). Recon: Kleo activities + routines + streak
rules + badge list.

### B9. 30-day sprint — p11, p24. Route `/challenge`. **Future (O11)**

Layout: S1 (sprint card active border). Header: h1 "30-day sprint" + subtitle "One proven post format every weekday, with two
worked examples."; right "Day 2/30" (stat, `/30` in `text-3`), "0 of 22 posted", Share progress (ghost), End sprint (text).
Banner panel: dot + "Don't break the chain." + missed-days copy + Catch up primary. Calendar grid 7 columns (Mon-Sun labels),
cards radius 14: states In progress / Today (accent border + glow, "Continue"), Missed ("Catch up"), Rest (dashed `line-faint`,
"No post planned"). Finish card spanning 4 columns: "Finish line · Nov 18", "Sprint badge", progress bar, "0 day streak · 22 to
go".

Data: challenge definition (30 formats with two examples each), start date, per-day status; Kleo `/api/challenge`,
`/api/challenge/strategy-handoff` (known). Recon: the format list, example posts, missed/catch-up rules, end/share behaviour.

### B10. Engage — p12, p25. Route `/engage` (new). **Future (O12)**

Layout: S1. Header: h1 + "Twenty minutes a day. Comment on the people in your plan, answer the people who showed intent.";
right segmented Comment queue / Leads inbox · 7 / Lists, Start session primary. Left column: filter chips (Audience plan,
Founders I follow, Ops leaders, Replied to me) + "8 posts · sorted by fit, then recency"; focused card (accent border, author
line, post excerpt, inner "Draft comment · your voice" box with Open on LinkedIn and paste / Another angle / Shorter / Skip,
"High fit" pill); collapsed rows (avatar, author, excerpt, "1h · 31 comments", Draft ready / Done). Right column: Leads inbox
panel (rows with Reply/Open, Push to HubSpot / Add to list), Today's session (ring "12m", "3 of 8 comments posted", "2 of 3 DMs
answered", "Counts toward today's activities"), How this is safe ("Orbit never comments for you. It drafts, you paste on
LinkedIn. No extension, no automation, no pods.").

Data: a feed of target people's posts (LinkedIn API limits make this hard), comment drafts (LLM, voice), leads signals,
CRM export. Kleo equivalent **unknown**: recon must establish whether Kleo has a comment queue/leads inbox; if not, this is
Orbit-original and needs its own data-source design (likely user-supplied lists + manual paste). Never automate comments.

### B11. Ideas, swipe file — p13, p26. Routes `/ideas`, `/inspiration`, `/following`, `/templates`, `/saves`. **Restyle (stubs) + Future feed (O9)**

Layout: S2. Sub-nav "Ideas": Discover (For you, Swipe file, Following, Hooks), Carousels (Created by you), My library (All saves,
"+" to add a space). Main: h1 "Swipe file" + search pill ("Pricing posts from founders under 20k foll…"), Last 30 days /
Newest pills; topic chips (All, B2B SaaS, Add topic dashed, divider, Outliers, Hidden gems, Top performers, Popular); 3-column
masonry of post cards (avatar, name, date · LinkedIn [· video], text with "more", reactions / comments · reposts, Save (ghost)
and Use post (paper) buttons; video poster with play circle).

Mapping: "Swipe file" = `/inspiration`; "Hooks" = `/templates`; "Created by you" (carousels) replaces `/images` label
"Images · Created by you" (images stay until carousels exist); Strategy and Knowledge are not in Orbit's sub-nav: Brandloop
adds **Strategy** at the top of Discover and **Knowledge** under My library (decision D7). Data: inspiration feed (Kleo
inspiration API, recon), saves/spaces (ROADMAP §4). Use post → new chat with the post as context.

### B12. Settings, integrations — p14, p27. Routes `/settings/*`. **Restyle (O3) + Future connectors (O13)**

Layout: S2. Sub-nav "Settings": Account (Integrations, Manage account, Memories, Manage team, Billing and subscription), Support
(Community, Talk to us); theme switch at the bottom (system §3). Main: h1 "Integrations" + subtitle; sections with `h2` 14/500
`text-2`: Social accounts (LinkedIn card with cobalt border + glow and primary "Connect LinkedIn"; X; Instagram, each with
paper "Connect"), AI assistants (AI assistants, Orbit CLI, Telegram: "Set up"; WhatsApp dashed "Coming soon"), Developers (API
key with mono masked key, Active pill, Copy / Rotate; MCP server with mono `npx orbit-mcp connect`; Zapier and webhooks + Add
endpoint), Apps (13 connector tiles: name, one-line, Connect).

Existing settings pages restyled in O3: Manage account (`/settings`, form: profile name, language, timezone — e2e "Settings
saved"), Memories (`/settings/memories`), Manage team, Billing, Community, Talk to us (currently "Talk to a person": label
changes, see migration §4). Data for integrations: Kleo `/api/integrations/status`, `/api/linkedin/status` (known); Composio
connectors (ROADMAP §10). Until built, every Connect button opens an honest "Not available yet" toast; the page shows no fake
"Active" states.

### B13. Mobile home — p16, p29. Route `/` at <768. **Restyle (O2)**

Described in B1 and A (M). Header `padding 60px 20px 12px` (60 includes the status-bar safe area; use
`env(safe-area-inset-top)` + 12). Cards: Today's post (with Open), Activities ("Comment on 8 posts", "4 left"), Latest draft
(title, excerpt, age). Latest draft maps to the most recent chat (Built: `/api/history`) until documents exist.

### B14. Existing screens Orbit does not draw (O3 restyles them with Orbit components)

| Route | Feature | Orbit treatment |
|---|---|---|
| `/strategy` | content strategy (positioning, mix, audience, formats, series) | S2 (Ideas section), page-title h1, panels 6.6, stat numbers for mix %, segmented controls, progress bars for audience balance |
| `/knowledge-base` | knowledge items list/import | S2 (Ideas section), board-card style rows, dashed "Add" card, status pills for indexing |
| `/settings/memories` | memories list, add/edit/delete, import dialog | S2 Settings, rows as panels, memory-tag style section labels |
| Voice / writing styles | composer `VoicePicker` (combobox "Search writing styles", "Add your style", "Learn my style") | popover on `panel`, options as rows, voice orb avatars; the voice pill (6.5) is the trigger |
| `/sign-in`, `/sign-up` | Clerk | centred on `ground` with ambient glow + grain, logo + wordmark, Clerk appearance per system §3 |
| `/design` (dev only) | the Orbit system page (p30) | O1 |
| `/posts`, `/activities`, `/analytics`, `/challenge`, `/following`, `/templates`, `/images`, `/saves` | placeholder pages | Orbit empty state: page-title h1, one-line description, panel with what is coming |

---

## C. Marketing (apps/marketing) — p00, p02, p04, p06. **Rebuild (O5)**

Static site; replaces the Kleo landing clone entirely. Sections alternate ink `#0A0A0B` and paper `#F5F4F0`. Max width 1328,
gutter 24. Every product shot is built in HTML/CSS (no screenshots of the app), using the app's tokens.

| # | Section (id) | Ground | Content | Motion |
|---|---|---|---|---|
| C1 | Nav pill (header) | over hero | centred pill: logo, Product / Method / Pricing / Journal chips, Sign in, Get started (paper) | drops in 18 px (900 ms); after hero shrinks to logo + two buttons (400 ms) [p31] |
| C2 | Hero | ink + wave field + grain | h1 3 lines "Put your / LinkedIn growth / in orbit." (last line `accent-text`), lead, Get started (56 px), roles marquee (Founders · Consultants · Recruiters · …, 46 s), orb right | lines rise 112% 1.2 s stagger 120 ms; lead/CTA fade-rise at .55 s; marquee at .8 s; orb fade 1.2 s + pointer drift [p00, p31] |
| C3 | Composer sheet | paper, overlapping hero by -110 px | white sheet radius 24: "New draft · Voice · yours" bar; left: mono eyebrow "DRAFT · IN YOUR VOICE · 09:41", typed draft with caret, composer (paper variant), chips Draft / Repurpose / Comment / Review / Plan; right (`#0E0E10`, 360 px): 30-day sprint card (ring, The contrarian take, checklist, Open today's post) | sheet rises 18 px; tilt ±4° toward pointer; caret blink [p00, p31] |
| C4 | The loop (`#loop`) | ink + cobalt radial | h2 "Most tools stop at the draft. / Orbit runs the whole loop." (line 2 `text-3`); note; numbered stage list 01-06 Capture, Voice, Draft, Publish, Engage, Learn; sticky frame showing the stage's mini-UI (Inbox, voice rules, swap hook, schedule, comment queue, per-format analytics); progress bar + counter "02 / 06" | pin 600 vh, each 100 vh advances a stage, frame crossfade (old 200 ms out, new rises 18 px over 600 ms), progress scrubbed with 0.6 s smoothing; hover also selects a stage [p00 script, p31] |
| C5 | Product chapters (`#product`) | paper | four alternating rows (mono eyebrow + h2 + paragraph | dark product shot radius 28): 02 Voice "Write in your voice, not the model's."; 03-04 Draft and publish "Plan a month in an afternoon." (week calendar); 05 Engage "Turn readers into conversations." (leads inbox); 06 Learn "Know what worked. Do more of it." (stats + format bars + "Next week's plan, adjusted") | headline lines rise; shot rises 24 px from scale .98; inner details stagger 120 ms; text column sticky on wide screens [p31] |
| C6 | Sprint (`#sprint`) | ink | h2 "Never start from a blank page." + copy + "Start the sprint"; horizontal track of day cards (DAY 01 STORY … today white), ruler with ring cursor | marquee rows 32 s / 40 s, velocity-linked, pause on hover, cards lift 8 px with blue border; (Orbit upgrade #7 pinned horizontal ruler optional) [p31] |
| C7 | Proof (`#proof`) | paper | h2 "Used by people who'd rather build than perform." + note; video poster card (play button, "03:48") + quote card with author and 1-of-5 pager; operator table (Operator / Role / Posts per wk / Outcome / Number, mono headers) + source note; member marquee | poster scale 1.04 → 1; quote lines rise; numerals count up 1.2 s [p02, p31] |
| C8 | Journal (`#journal`) | ink | mono eyebrow "09 · THE JOURNAL · EVERY TUESDAY", h2 "One email a week. Six posts, taken apart, with the numbers attached.", email input + Subscribe, "Free. 14,000 readers…" (copy must be true at launch: replace numbers we cannot claim); right list 6 / 2 / 1 / 3 | four rows fade-rise 120 ms; input ring on focus [p02] |
| C9 | Pricing (`#pricing`) | paper | h2 "One system. Two ways in."; Solo $39 (white card, 6 numbered features) and Studio $99 (ink card, cobalt glow, 5 checked features, "Up to 5 profiles"); trial note "7-day free trial on both. Official LinkedIn API, no browser extension, no cookies." | cards rise; Studio orbit ring spins only in view; feature rows 60 ms apart [p31] |
| C10 | Team (`#team`) | ink | h2 "Built by operators who did it first."; three staggered portrait cards (B/W portrait placeholder caption mono, quote, name, role, follower pill) | cards rise 120 ms; photo sweep on hover [p04] |
| C11 | FAQ (`#faq`) | paper | h2 "Questions, answered." + "Talk to us"; accordion (6 questions; open item shows close button) | height 400 ms, plus rotates 45° [p31] |
| C12 | Footer | ink | h2 "Your first post goes out tomorrow at eight." + Start free trial / Talk to us; columns Product / Learn / Company (upper-case labels); journal input; city clocks (Bengaluru, Berlin, New York) + "All systems operational"; back-to-top; legal "© 2026 Orbit Labs…", Privacy, Terms, "Not affiliated with LinkedIn."; giant cropped `orbit` wordmark (Bricolage, fills width via SVG `textLength`) | sticky reveal from behind FAQ; wordmark weight 300 → 800 and blue highlight follow the pointer (80 ms lag); back-to-top 1.2 s [p30, p31] |
| C13 | Mobile (p06) | | a condensed composition, not a reflow: hero with orb top-right, composer card "What are we putting out there?" with 4 chips; "Hundreds of founders build their audience with Orbit." member card carousel; "The whole loop, not a text box." with tabs 01 Strategy / 02 Voice / 03 Sprint / 04 Swipe and a content-mix sheet ("Swipe the sheet to advance · tabs scroll-snap"); pricing stacked; FAQ 3 items; "Stop guessing, that builds the business." + email + Get started; 2-column footer links, social icons, wordmark | scroll-snap tabs; no pinning on mobile |

Claims: proof numbers, testimonials, reader counts, team bios and city clocks in the artboards are design content. O5 ships
them only as clearly placeholder copy behind a `data-placeholder` flag the controller must clear before launch (decision D9).
Links: Sign in / Get started → the web app's `/sign-in` and `/sign-up` (configurable base URL).

---

## D. Coverage matrix

| Orbit artboard | Route | Status | Task |
|---|---|---|---|
| p01/p17 Home | `/` | Restyle + honest cards | O2 |
| p16/p29 Mobile home | `/` <768 | Restyle | O2 |
| p03/p18 Chat | `/chat/[id]` | Restyle (after Task 7) | O4 |
| p14/p27 Settings | `/settings/*` | Restyle; connectors future | O3, O13 |
| p13/p26 Ideas | `/ideas` … | Restyle shell; feed future | O3, O9 |
| p05/p19 Editor | `/posts/[id]` | Future | O6 |
| p08/p21 Board, p15/p28 Calendar | `/posts` | Future | O6 |
| p07/p20 Carousel | `/posts/[id]/carousel` | Future | O7 |
| p09/p22 Analytics | `/analytics` | Future | O8 |
| p10/p23 Activities | `/activities` | Future | O10 |
| p11/p24 Sprint | `/challenge` | Future | O11 |
| p12/p25 Engage | `/engage` | Future | O12 |
| (pill only) Notifications | popover | Future | O14 |
| p30 System | `/design` | Build | O1 |
| p00/p02/p04/p06 Marketing | `apps/marketing` | Rebuild | O5 |
