# Library, habits and AI assistant connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saves/spaces, weekly ideas, own templates, a stored 30-day challenge, Activities goals/to-dos/badges, the What's New bell and an MCP connector for AI assistants, all working before LinkedIn is connected.

**Architecture:**
- **Four phases (A–D), one branch and one migration each, merged into `orbit/run` in order.**
- **Database layer:** services in `packages/db/src/services/<area>.ts`, each with a `.test.ts` on the test database.
- **Web layer:** route handlers live in `apps/web/src/lib/<area>-api.ts`, with thin `app/api/**/route.ts` files calling them (the existing `templates-api.ts` pattern). Pure logic goes in `apps/web/src/lib/<area>/*.ts`. Components go in `apps/web/src/components/<area>/`.
- **Evidence:** one Playwright spec per feature, in mock mode.

**Tech Stack:** Next.js App Router, Prisma 7 (Neon Postgres), Clerk, AI SDK (`@brandloop/ai` AiClient, Luna only), Vitest, Playwright, Vercel Cron, `mcp-handler` + `@clerk/mcp-tools` (phase D).

**Spec:** `docs/superpowers/specs/2026-11-04-library-habits-connector-design.md`. Read it before any task. It holds the copy, the numbers and the owner decisions.

## Global Constraints

- **AI.** OpenAI only (no other model provider, no fallback). Only allowed models run (`ALLOWED_TEXT_MODELS`, Luna). The only new AI calls are weekly ideas (one per active profile per week) and "save post as template" (one per click). Both go through `AiClient` with a `feature` set, so they land in the `AiUsage` ledger.
- **Tests.** Never touch the real database: unit tests route to `TEST_DATABASE_URL`, and e2e uses `dev:e2e` (test DB, `AI_MOCK_MODEL=1`). No real AI calls in tests.
- **Migrations.**
  - One per phase, hand-written SQL in `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`, following `20261028120000_ai_usage`.
  - Apply to the test DB with `prisma migrate deploy` under `TEST_DATABASE_URL`.
  - The real database only gets a migration after a `pg_dump` backup to `.recon/backups/` and the owner's go-ahead (done by the coordinator, not the implementer).
- **Scope.** Everything is per profile: every query filters by `profileId`, and another profile's row returns 404.
- **No data that isn't real.** No sample data; empty states explain what will appear. Never publish or schedule anything to LinkedIn.
- **UI.**
  - Orbit tokens and components only (see `components/chat/options-panel.tsx` for the dock language); no new colours.
  - Motion: a subtle fade only.
  - Native cursor.
  - Works at 390 px, in dark and light, and passes axe (no serious or critical violations).
  - Keyboard: everything reachable, Esc closes popovers and dialogs, focus is visible.
- **Account cache.** Any mutation that changes what the account loader returns must expire the `account` cache tag (see the speed fixes in `apps/web/src/lib/account.ts`).
- **Commits.** Conventional messages, no co-author trailer, no assistant mentions. The repo is public: never name the reference product in code, docs, commits or data.
- **Done per task:** `pnpm -r --if-present typecheck` is clean and the touched packages' vitest suites pass. A DB-backed file that fails in a full run is re-run alone before it's treated as real.

## Review Focus

1. **Double clicks and races** on Save, Like, +1, Mark as posted, Start challenge and Generate ideas must not create duplicates or wrong counts. Pin each with unique constraints plus a test that calls the handler twice concurrently.
2. **A deleted target** (post, template, image) that is still saved or linked from a challenge day must show "No longer available", never crash the page. Test it in the saves and challenge services.
3. **Timezone edges.** A profile in UTC−8 and one in UTC+13 must get the right local week, generation day, streak week and challenge "today" around midnight. Pin with fixed-`now` tests in `ideas/week.ts` and `sprint/status.ts`.
4. **Cron cost bounds.** The cron must never generate twice for the same week, and never for a profile inactive for more than 14 days. It processes at most 50 profiles per run. Test the selector and the unique key.
5. **MCP isolation.** A token for user A bound to profile P must never read or write profile Q's data, and must not be able to publish or delete. Test every tool with a second profile.

---

## Phase A: Saves + own templates

Branch `orbit/saves-templates`. Migration `20261105090000_saves_templates`.

### Task A1: Saves data and service

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
  - add `SaveSpace`, `SavedItem`, `SavedItemSpace` and the enum `SavedKind { TEMPLATE HOOK IDEA POST VISUAL }`
  - add `Template.likeCount Int @default(0)`, `Template.useCount Int @default(0)` and a `TemplateLike` model
- Create: `packages/db/prisma/migrations/20261105090000_saves_templates/migration.sql`. It copies every `TemplateSave` row into `SavedItem` (kind TEMPLATE, refId = templateId, snapshot `{title}`), then drops `TemplateSave`. It backfills `useCount` from `TemplateUse`.
- Create: `packages/db/src/services/saves.ts`, `packages/db/src/services/saves.test.ts`
- Modify: `packages/db/src/services/templates.ts` (`setTemplateSaved` and `listTemplates.savedBy` now read and write `SavedItem`), `packages/db/src/index.ts` (exports)

**Interfaces (produces):**
```ts
type SpaceRow = { id: string; name: string; description: string | null; pinned: boolean; position: number; itemCount: number };
type SavedItemRow = { id: string; kind: SavedKind; refId: string | null; snapshot: Record<string, unknown>; spaceIds: string[]; available: boolean; createdAt: Date };
listSpaces(profileId): Promise<SpaceRow[]>                        // pinned first, then position
createSpace(profileId, { name: string; description?: string }): Promise<SpaceRow>   // name 1..30 trimmed, description ≤500, else SavesError("invalid")
updateSpace(profileId, id, patch: { name?; description?; pinned? }): Promise<SpaceRow>
deleteSpace(profileId, id): Promise<void>                          // items stay in All saves
saveItem(profileId, { kind; refId?; snapshot; spaceIds? }): Promise<SavedItemRow>   // idempotent per (profileId, kind, refId) or (profileId, kind, snapshot.text) when refId is null
unsaveItem(profileId, itemId): Promise<void>
listSaved(profileId, { kind?; spaceId?; cursor?; limit }): Promise<{ items: SavedItemRow[]; nextCursor: string | null }>
setItemSpaces(profileId, itemId, spaceIds: string[]): Promise<SavedItemRow>
reorderSpaceItems(profileId, spaceId, itemIds: string[]): Promise<void>
class SavesError extends Error { code: "invalid" | "not_found" }
```
The `available` flag is false when the referenced Template, Document or Visual no longer exists or is soft-deleted.

- [ ] **Step 1: Write the failing tests** in `saves.test.ts`:
  - `"a space name must be 1–30 characters"`
  - `"saving the same template twice keeps one item"`: two concurrent `saveItem` calls give one row
  - `"deleting a space keeps its items in All saves"`
  - `"an item can live in two spaces and unsave removes it from both"`
  - `"a saved post that is deleted lists as unavailable"`
  - `"another profile's space is not found"`
  - `"existing template saves survive the migration"`: `listTemplates({ savedBy })` still returns them
- [ ] **Step 2:** Run `pnpm --filter @brandloop/db exec vitest run src/services/saves.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Write the schema and migration, apply the migration to the test DB, regenerate the client, and implement the service.
- [ ] **Step 4:** Re-run the tests, plus `src/services/templates.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(db): saves and spaces; template saves move into saved items`.

### Task A2: Saves API

**Files:**
- Create: `apps/web/src/lib/saves-api.ts`, `apps/web/src/lib/saves-api.test.ts`
- Create: `apps/web/src/app/api/saves/route.ts` (GET list, POST save), `api/saves/[id]/route.ts` (PATCH `{spaceIds}`, DELETE), `api/spaces/route.ts` (GET, POST), `api/spaces/[id]/route.ts` (PATCH, DELETE), `api/spaces/[id]/order/route.ts` (PUT `{itemIds}`)

**Interfaces:**
- Consumes: A1.
- Produces: `GET /api/saves?kind=&space=&cursor=` → `{items, nextCursor}`; `POST /api/saves` `{kind, refId?, snapshot}` → `201 {item}`.
- Bodies are validated with zod, capped at 8 KB, and run through the same per-profile `RateLimiter` used by `ideas-api.ts` (60 writes / 10 min).

- [ ] **Step 1: Write the failing tests:**
  - `"POST /api/saves validates kind and refId ownership"`: another profile's document returns 404
  - `"PATCH /api/saves/:id moves an item between spaces"`
  - `"rate limit returns 429 with the friendly message"`
- [ ] **Step 2:** Run `pnpm --filter web exec vitest run src/lib/saves-api.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the handlers and route files.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(saves): API for saves and spaces`.

### Task A3: Save menu, All saves page, spaces in the sidebar

**Files:**
- Create: `apps/web/src/components/saves/save-menu.tsx`, with props `{ kind: SavedKind; refId?: string; snapshot: Record<string, unknown>; label: string; initialItemId?: string | null }`. It's a "Save ▾" button with "Save to All saves", the space checklist and "New space…".
- Create: `apps/web/src/components/saves/saves-view.tsx` (type filter tabs, list, "No longer available" + Remove, drag reorder with a keyboard "Move to…" menu, space header with rename/pin/delete) and `components/saves/space-dialog.tsx`.
- Modify: `apps/web/src/app/(app)/saves/page.tsx`. Replace `LibraryEmpty`; `?space=<id>` shows one space.
- Modify: the sidebar nav component that renders "My library" (find it via `apps/web/src/lib/nav.ts`). List spaces (pinned first), with a "+" that opens `space-dialog`.
- Modify, to wire `SaveMenu` in: the template cards (`components/templates/*`), hook cards in chat (`components/chat/*hook*`), idea cards (`components/ideas/*`), post cards and rows (`components/posts/*`), and image library tiles (`components/visuals/*`).

- [ ] **Step 1:** Write a unit test for the pure reorder helper `moveItem(ids: string[], from: number, to: number): string[]` in `components/saves/order.ts`: `"moves down, up and to the ends"`.
- [ ] **Step 2:** Implement the components, then the wiring.
- [ ] **Step 3:** Run `pnpm --filter web exec vitest run src/components/saves`. Expected: PASS.
- [ ] **Step 4: Commit** with `feat(saves): save menu everywhere, All saves page and spaces`.

### Task A4: Own templates, likes and counts

**Files:**
- Modify: `packages/db/src/services/templates.ts`. Add:
  - `createTemplate(profileId, input: { title; type: "HOOK" | "POST"; category; skeleton; why? })`: slug `own-<cuid>`, `system=false`. The skeleton must contain at least one `[slot]` (else `invalid`); title ≤80, skeleton ≤3000.
  - `updateTemplate` and `deleteTemplate`, both owner only.
  - `setTemplateLiked(profileId, templateId, liked)`, which keeps `likeCount` in the same transaction.
  - `recordTemplateUse`, which now increments `useCount`.
  - `listTemplates`, which gains `sort: "popular" | "newest"`. Popular = likes plus uses in the last 30 days, then all-time `likeCount + useCount`, then title. Rows also report `liked` and `own`.
- Modify: `packages/db/src/services/templates.test.ts`.
- Create: `apps/web/src/lib/templates/from-post.ts` with `suggestTemplateFromPost(ai: AiClient, postText: string): Promise<{ title; type; category; skeleton; why }>`. It uses the `extract` alias with `feature: "template-from-post"` and must return at least one `[slot]`. Test: `from-post.test.ts` with a scripted AiClient.
- Modify: `apps/web/src/lib/templates-api.ts`, and add routes `api/templates/route.ts` POST, `api/templates/[id]/route.ts` PATCH/DELETE, `api/templates/[id]/like/route.ts` POST/DELETE, `api/templates/from-post/route.ts` POST `{documentId}` → suggestion only (no save). The from-post route has a rate limit of 10 per hour per profile.
- Modify: UI. `components/templates/*`: "+ New template", a `template-form.tsx` dialog (live preview highlighting `[slots]`), a heart and "Used N times" on cards, and a sort select (Popular · Newest). Own cards show "You", with edit and delete (delete asks first). Add "Save as template" to the post menu, which opens the form prefilled from the suggestion.

- [ ] **Step 1: Write the failing tests:**
  - `"an own template needs a [slot]"`
  - `"likes are counted once per profile and unlike decrements"`, with concurrent likes
  - `"popular sort ranks recent likes and uses first"`
  - `"another profile cannot edit or see my own template"`
  - `"from-post returns a skeleton with slots or throws a friendly error"`
- [ ] **Step 2:** Run the db and web tests. Expected: FAIL.
- [ ] **Step 3:** Implement the services, routes and UI.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(templates): own templates, save post as template, likes and use counts`.

### Task A5: Phase A e2e

**Files:** create `apps/web/e2e/saves.spec.ts` and `apps/web/e2e/templates-own.spec.ts`; modify `apps/web/e2e/templates.spec.ts` if its save assertions change.

- [ ] **Step 1:** In `saves.spec.ts`:
  - create the space "Hooks I like"
  - save a template into it from /templates, a hook from a mock chat, and a post from /posts
  - /saves lists 3; the space lists 2
  - reorder by keyboard
  - delete the space: the items remain
  - run axe in both themes; no horizontal scroll at 390 px
- [ ] **Step 2:** In `templates-own.spec.ts`:
  - create a template with a `[slot]`; it appears with "You"
  - like it; the count is 1
  - draft a post with it; "Used 1 time"
  - "Save as template" from a post (mock AI): the prefilled form is saved
  - delete with the confirmation
- [ ] **Step 3:** Run `PLAYWRIGHT_BASE_URL=http://localhost:3200 pnpm --filter web exec playwright test e2e/saves.spec.ts e2e/templates-own.spec.ts e2e/templates.spec.ts` with `PORT=3200 pnpm --filter web dev:e2e`. Expected: all pass.
- [ ] **Step 4: Commit** with `test(e2e): saves and own templates`.

## Phase B: Weekly ideas + the bell

Branch `orbit/ideas-bell` (from `orbit/run` after A merges). Migration `20261106090000_ideas_notifications`.

### Task B1: Ideas and notifications data

**Files:**
- Modify the schema:
  - `Idea {id, profileId, weekStartOn @db.Date, position Int, category, title, detail, prompt, sourceKind, sourceRef?, drafted Boolean @default(false), chatId?, hidden Boolean @default(false), origin "weekly"|"chat", createdAt}` with `@@unique([profileId, weekStartOn, origin, position])`
  - `Notification {id, profileId, kind String, title, href, dedupeKey String?, createdAt, readAt?}` with `@@unique([profileId, dedupeKey])`
  - `Profile.lastActiveAt DateTime?`
- Create: the migration, `packages/db/src/services/ideas.ts` and `packages/db/src/services/notifications.ts`, each with tests.
- Create: `apps/web/src/lib/ideas/week.ts` with `weekStartOn(now: Date, timezone: string): string` (the Monday of the profile's local week, `YYYY-MM-DD`) and `dueForGeneration(now, timezone, generationDayOfWeek: number /*1=Mon..7=Sun*/): boolean` (local weekday ≥ generation day).
- Modify: the account loader, which sets `lastActiveAt` at most once an hour (write throttled).

**Interfaces (produces):**
```ts
saveIdeaBatch(profileId, weekStartOn, origin, ideas: IdeaInput[]): Promise<{ created: boolean; ideas: IdeaRow[] }>  // unique key makes it idempotent
listIdeaWeeks(profileId, { weeks: number }): Promise<{ weekStartOn: string; ideas: IdeaRow[] }[]>
setIdeaHidden(profileId, id, hidden): Promise<void>
markIdeaDrafted(profileId, id, chatId): Promise<void>
createNotification(profileId, { kind; title; href; dedupeKey? }): Promise<void>       // duplicate dedupeKey is a no-op
listNotifications(profileId, limit = 20): Promise<{ items: NotificationRow[]; unread: number }>
markNotificationsRead(profileId, ids: string[] | "all"): Promise<void>
pruneNotifications(olderThanDays = 30): Promise<number>
```

- [ ] **Step 1: Write the failing tests:**
  - `"weekStartOn handles UTC-8 and UTC+13 around midnight"` (fixed instants)
  - `"dueForGeneration is true on and after the generation day"`
  - `"saving the same week's batch twice creates once"` (concurrent)
  - `"a duplicate dedupeKey notification is ignored"`
  - `"read marks only the given ids"`
  - `"prune removes events older than 30 days"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(db): stored ideas and notifications`.

### Task B2: Weekly generation, chat ideas kept, daily cron

**Files:**
- Create: `apps/web/src/lib/ideas/weekly.ts` with `generateWeeklyIdeas(profileId: string, deps: { ai: AiClient; now: () => Date }): Promise<"created" | "exists" | "failed">`.
  - It reuses `ideas-generate.ts` with count 5, then calls `saveIdeaBatch(..., "weekly")`.
  - On success: `createNotification` with kind `IDEAS_READY`, title "This week's ideas are ready", href `/ideas`, dedupeKey `ideas:<week>`.
  - On failure: no retry loop, and the failure is logged.
- Modify: wherever the chat's `generateIdeas` tool output is produced (`packages/agent/src/writing/ideas*`, the deps in `apps/web/src/lib/chat-deps.ts`). Pass an optional `saveIdeas` dep that stores the picker ideas as `origin "chat"` for the current week, fire-and-forget.
- Create: `apps/web/src/app/api/cron/daily/route.ts` (GET). It requires `Authorization: Bearer ${process.env.CRON_SECRET}` (401 otherwise, and 503 when `CRON_SECRET` is unset in production). It then:
  1. selects at most 50 profiles with `lastActiveAt` in the last 14 days, `dueForGeneration` true and no weekly batch for their week
  2. generates each one sequentially
  3. runs `pruneNotifications(30)`
  4. runs the phase C hooks (C2 adds challenge reminders)

  It returns `{generated, skipped, failed}`.
- Create: `apps/web/vercel.json` with `{"crons":[{"path":"/api/cron/daily","schedule":"0 5 * * *"}]}` (merge if the file exists).
- Create: `apps/web/src/app/api/ideas/weekly/route.ts`. GET returns `listIdeaWeeks(8)` plus `generationDayOfWeek`. POST generates on demand only when this week's batch is missing (otherwise 409), with a rate limit of 2 per day.
- Create: `apps/web/src/app/api/ideas/[id]/route.ts` (PATCH `{hidden}`) and `api/ideas/[id]/draft/route.ts` (POST → creates the chat seeded with the idea through the existing idea-pick flow, and returns `{chatId}`).
- Modify: the profile settings route, so the generation day can be changed at most 3 times per 7 days (CounterStore key `genday:<profileId>`), and returns 429 with "You can change this again next week."
- Modify: `.env.example` to add `CRON_SECRET=` with a comment.

- [ ] **Step 1: Write the failing tests:**
  - `"cron rejects a missing or wrong secret"`
  - `"cron skips inactive profiles and profiles with this week's batch, caps at 50"`
  - `"generateWeeklyIdeas creates once and posts one IDEAS_READY notification"`
  - `"on-demand POST returns 409 when the batch exists"`
  - `"generation day changes are limited to 3 a week"`
  - `"chat ideas are stored with origin chat"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(ideas): weekly ideas with a daily cron, on-demand fallback, chat ideas kept`.

### Task B3: For you page

**Files:** modify `apps/web/src/app/(app)/ideas/page.tsx` and the `components/ideas/*` For you view.
- This week's 5 cards: category, title, detail, then **Draft** (POST draft → navigate), **Save** (`SaveMenu` kind IDEA with the snapshot) and **Hide**. Drafted cards show "Drafted".
- A collapsed "Hidden" section with Restore.
- Earlier weeks, collapsed by week label.
- The header "New ideas every Monday", with a day select (PATCH; the 429 message inline).
- When the week has no batch: a "Make this week's ideas" button (POST). On failure: "This week's ideas didn't arrive. Try again".

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Typecheck and run the web tests. Expected: PASS.
- [ ] **Step 3: Commit** with `feat(ideas): For you shows stored weekly ideas`.

### Task B4: The bell

**Files:**
- Create: `apps/web/src/lib/whats-new.ts` with `buildDerivedRows(input: { challenge: { day: number; posted: number; total: number; href: string } | null; ideasWaiting: number; nextStep: { title: string; href: string } | null }): WhatsNewRow[]`, plus a test.
- Create: `api/notifications/route.ts`. GET returns `{derived, items, unread}`; POST `/api/notifications/read` takes `{ids} | {all: true}`.
- Modify: `apps/web/src/components/shell/notifications.tsx`. The bell gets a dot when `unread > 0` or derived rows exist. The popover is titled "What's New":
  - derived rows first
  - then stored events, each with a relative time and a link
  - "Mark all read"
  - opening it marks the visible events read
  - Esc closes it and focus returns to the bell
- Modify: `apps/web/src/lib/visuals/handle-visual-job.ts` so that on success it creates `IMAGE_READY` "Your image is ready", with href to the image library and dedupeKey `visual:<id>`.

- [ ] **Step 1: Write the failing tests:**
  - `"derived rows: challenge first, then ideas waiting, then next step; none when empty"`
  - `"GET returns unread count; read all clears it"`
  - `"an image job success adds one IMAGE_READY"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(shell): What's New bell with derived rows and stored events`.

### Task B5: Phase B e2e

**Files:**
- Create: `apps/web/e2e/ideas-weekly.spec.ts` and `apps/web/e2e/bell.spec.ts`.
- Modify: the existing dev-only route pattern (`/api/dev/*`, 404 outside mock mode) to add `POST /api/dev/cron` (runs the cron logic without the secret, mock mode only).

- [ ] **Step 1:** In `ideas-weekly.spec.ts`:
  - with no batch, For you shows "Make this week's ideas"; click it and 5 cards appear
  - Hide one: it moves to Hidden, then Restore
  - Save one: it shows in /saves
  - Draft one: a chat opens and a draft is written
  - the dev cron run reports `exists` for this profile
- [ ] **Step 2:** In `bell.spec.ts`:
  - after the dev cron for a fresh week, the bell has a dot and lists "This week's ideas are ready"
  - opening it clears the dot
  - Esc returns focus
  - axe in both themes
- [ ] **Step 3:** Run them with `e2e/ideas.spec.ts` and `e2e/writing-ideas.spec.ts`. Expected: all pass.
- [ ] **Step 4: Commit** with `test(e2e): weekly ideas and the bell`.

## Phase C: Challenge + Activities

Branch `orbit/challenge-activities`. Migration `20261107090000_challenge_activities`.

### Task C1: Mark as posted

**Files:**
- Schema: `Document.postedAt DateTime?`.
- Services: `setDocumentPosted(profileId, documentId, posted: boolean)` in `packages/db/src/services/documents.ts`.
- Route: `api/documents/[id]/posted/route.ts` (POST / DELETE).
- UI: "Mark as posted" / "Posted ✓ (undo)" in the editor header and the post menu, and a Posts board badge.
- Switch `apps/web/src/lib/progress/activity.ts` and `packages/db/src/services/progress.ts` to count **posted** posts (`postedAt`) for the posts goal, the streak and milestones; drafting counts stay where they are labelled "drafts".

- [ ] **Step 1: Write the failing tests:**
  - `"posting twice keeps the first postedAt; undo clears it"`
  - `"the posts count uses postedAt in the profile's week"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(posts): mark as posted drives progress`.

### Task C2: Stored challenge

**Files:**
- Schema:
  - `ChallengeEnrollment {id, profileId, startDate @db.Date, endedAt?, completedAt?, createdAt}`, with a partial unique index (one active enrollment per profile) in the SQL
  - `ChallengeDay {id, enrollmentId, dayNumber 1..30, date @db.Date, formatId String?, chatId String?}`, with rest days having `formatId = null`
- Create: `packages/db/src/services/challenge.ts`:
  - `startChallenge(profileId, startDate: string)` (409 when one is active)
  - `getActiveChallenge(profileId)` → the enrollment and its days, each with the linked document via `Chat.documentId`, plus `postedAt`
  - `endChallenge(profileId)`
  - `openChallengeDay(profileId, dayNumber)`, which creates or returns the day's chat seeded with the sprint prompt from `apps/web/src/lib/sprint/links.ts` and returns `{chatId}`
  - when the 30th day passes, `completedAt` is set lazily on read
- Create: `apps/web/src/lib/sprint/status.ts` with `dayStatus(day: { date: string; formatId: string | null }, today: string, doc: { postedAt: Date | null } | null): "rest" | "upcoming" | "today" | "in_progress" | "posted" | "missed"`, and `pickFormats(curriculum): Format[22]`, which drops the one format marked `optional` in `lib/sprint/curriculum.ts` (add that flag to the weakest-fit format).
- Routes: `api/challenge/route.ts` (GET, POST `{startDate}`, DELETE) and `api/challenge/days/[n]/open/route.ts` (POST).
- UI:
  - `app/(app)/challenge/page.tsx` and `components/sprint/sprint-view.tsx` use the stored enrollment
  - Start (today or a date picker), the calendar with statuses, Continue / Catch up
  - the missed banner "You've missed N days. Posting today still counts"
  - End (with a confirmation), the finished summary, Start again
  - the sidebar card "30-day challenge · Day N · x of 22 posted" or "Not started"
- Cron hook (B2 route): a `CHALLENGE_ENDING` notification "Your challenge ends in 3 days", with dedupeKey `challenge-ending:<enrollmentId>`.

- [ ] **Step 1: Write the failing tests:**
  - `"22 posting days on weekdays within 30 days for a Wednesday start"`
  - `"dayStatus covers rest, upcoming, today, in_progress, posted, missed"`
  - `"a missed day posted later counts as posted"`
  - `"one active enrollment per profile, even with two concurrent starts"`
  - `"a deleted post on a challenge day shows the day as missed, not an error"`
  - `"another profile cannot open my day"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(challenge): stored 30-day challenge with statuses, catch-up and end`.

### Task C3: Goals, to-dos and badges

**Files:**
- Schema:
  - `WeeklyGoal {profileId @id, preset String, posts Int, comments Int, dms Int, connections Int}`
  - `GoalTally {profileId, weekStartOn @db.Date, kind String, count Int}` with `@@id([profileId, weekStartOn, kind])`
  - `Task {id, profileId, title, note?, repeat "once"|"weekdays"|"weekly", weekday Int?, position Int, pausedUntil DateTime?, createdAt}`
  - `TaskDone {taskId, date @db.Date, status "DONE"|"SKIPPED"}` with `@@id([taskId, date])`
  - `Badge {profileId, badgeId, awardedAt}` with `@@id([profileId, badgeId])`
- Create: `apps/web/src/lib/progress/goals.ts` with `GOAL_PRESETS = { momentum: {posts:3,comments:25,dms:5,connections:10}, growth: {posts:5,comments:50,dms:10,connections:50}, creator: {posts:7,comments:70,dms:15,connections:35} }`, the default `growth`, and `weekStreak(weeks: { posted: number; goal: number }[]): number`.
- Create: `apps/web/src/lib/progress/tasks.ts` with `tasksForDate(tasks, dones, date: string, today: string): { task; carriedOver: boolean; status: "open" | "done" | "skipped" }[]`. A one-off that isn't done carries to today; weekdays/weekly repeat; paused tasks are hidden; pause is at most 28 days.
- Create: `apps/web/src/lib/progress/badges.ts` with `BADGES` (ids: `first-post`, `posts-5`, `posts-10`, `posts-25`, `first-full-week`, `streak-4`, `challenge-finished`, `first-template`, `first-space`, `ideas-drafted-10`, each with a label and an icon from the existing set) and `earnedBadges(signals): string[]`. Plus `packages/db/src/services/badges.ts` with `awardBadges(profileId): Promise<string[]>`, which is idempotent and creates a `BADGE_EARNED` notification "Badge earned: <label>" per new badge. Call it after posted, template create, space create, idea drafted and challenge end.
- Routes:
  - `api/goals/route.ts` (GET, PUT `{preset} | {custom}`)
  - `api/goals/tally/route.ts` (POST `{kind: "comments"|"dms"|"connections", delta: 1|-1}`, floor 0)
  - `api/tasks/route.ts` (GET `?date=`, POST)
  - `api/tasks/[id]/route.ts` (PATCH, DELETE)
  - `api/tasks/[id]/done/route.ts` (POST `{date, status}`, DELETE)
  - `api/tasks/order/route.ts` (PUT `{ids}`)
- UI: `components/activities/activities-view.tsx`:
  - the goals card with Edit (presets plus custom) and +1/−1 with "Counted by you until LinkedIn is connected"
  - the streak card with its warning on the last day of the week
  - to-dos with "+ Add activity" (`task-dialog.tsx`), done tick, skip, pause, and drag/keyboard reorder
  - the day strip counting done/total
  - milestones, with "All badges" showing locked and unlocked

- [ ] **Step 1: Write the failing tests:**
  - `"presets match the spec numbers"`
  - `"weekStreak counts consecutive met weeks back from last week, plus this week if met"`
  - `"a missed one-off carries over; skip hides for today; pause over 28 days is rejected"`
  - `"tally never goes below zero and double +1 counts twice"`
  - `"awardBadges awards once and notifies once"`
  - `"another profile's task is not found"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(activities): weekly goals, to-dos and badges`.

### Task C4: Phase C e2e

**Files:** create `apps/web/e2e/challenge.spec.ts` and `apps/web/e2e/activities.spec.ts`; update `apps/web/e2e/progress.spec.ts` to the stored behaviour.

- [ ] **Step 1:** In `challenge.spec.ts`:
  - start today; the sidebar card shows "Day 1 · 0 of 22 posted"
  - Continue opens the day chat and the mock draft
  - Mark as posted: the day shows Posted and the card shows 1 of 22
  - End with the confirmation; the summary shows; Start again
- [ ] **Step 2:** In `activities.spec.ts`:
  - pick the Momentum preset
  - +1 comments twice and −1 once: the count is 1
  - add a weekday to-do and tick it: the day strip shows 1/1
  - mark a post as posted: the badge "First post" unlocks and the bell shows "Badge earned: First post"
  - axe in both themes, at 390 px
- [ ] **Step 3:** Run them with `progress.spec.ts`. Expected: all pass.
- [ ] **Step 4: Commit** with `test(e2e): challenge and activities`.

## Phase D: AI assistant connector (MCP)

Branch `orbit/mcp`. Migration `20261108090000_mcp`.

### Task D1: Endpoint and OAuth metadata

**Files:**
- Modify: `apps/web/package.json`. Add `mcp-handler` and `@clerk/mcp-tools` at exact versions published at least two weeks ago (check `npm view <pkg> time`), then update `pnpm-lock.yaml`.
- Create:
  - `apps/web/src/app/api/mcp/route.ts`: `createMcpHandler` with `basePath: "/api"`, wrapped by `withMcpAuth`, which verifies the Clerk OAuth token through `@clerk/mcp-tools`; `required: true`
  - `apps/web/src/app/.well-known/oauth-protected-resource/route.ts` and `.well-known/oauth-authorization-server/route.ts`, using the `@clerk/mcp-tools/next` helpers
- Modify: `apps/web/src/proxy.ts` (or the Clerk middleware file). `/api/mcp` and `/.well-known/*` skip the session redirect (bearer auth instead).
- Mock mode only (`isMockMode`): header `x-orbit-e2e-mcp-user: <clerkUserId>` stands in for a token, the same rule as the `orbit-e2e-admin` cookie. Outside mock mode it is ignored.

- [ ] **Step 1: Write the failing tests:**
  - `"no token: 401 with WWW-Authenticate pointing at the resource metadata"`
  - `"the e2e header is ignored outside mock mode"`
  - `"metadata routes return the Clerk issuer"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(mcp): authenticated MCP endpoint and OAuth metadata`.

### Task D2: Binding, clients and the settings screen

**Files:**
- Schema: `McpBinding {userId @id, profileId}` and `McpClient {id, userId, clientId, clientName, lastUsedAt, revokedAt?}` with `@@unique([userId, clientId])`.
- Services: `packages/db/src/services/mcp.ts`:
  - `getBinding(userId)`, which defaults to the user's current profile
  - `setBinding(userId, profileId)`, owner profiles only
  - `touchClient(userId, clientId, clientName)`
  - `listClients(userId)`
  - `revokeClient(userId, id)`, after which calls from that client get 401
- Routes: `api/mcp-settings/route.ts` (GET binding and clients, PUT `{profileId}`) and `api/mcp-settings/clients/[id]/route.ts` (DELETE).
- UI: `app/(app)/settings/integrations/page.tsx` "AI assistants":
  - tabs: ChatGPT and Codex only (owner decision: Orbit is OpenAI only)
  - the server URL `<origin>/api/mcp` with Copy
  - per-tab steps: ChatGPT connector steps (Settings → Connectors → add a custom connector with the URL) and the Codex CLI config (`codex mcp add orbit --url <url>`; check the current Codex CLI syntax at build time)
  - "AI assistants act as: <profile select>"
  - connected assistants, with Disconnect

- [ ] **Step 1: Write the failing tests:**
  - `"binding defaults to the current profile and cannot point at another user's profile"`
  - `"a revoked client is refused"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(mcp): profile binding, connected assistants and setup screen`.

### Task D3: Tools

**Files:** create `apps/web/src/lib/mcp/tools.ts` (registers the tools on the handler) and `apps/web/src/lib/mcp/tools.test.ts`.
- Every tool resolves `profileId` from the binding, runs the per-profile limiter (scope `mcp`, 60 calls per 10 minutes), and returns plain text and JSON content with no other profile's data.
- Reuse the existing services. Tools and zod inputs:
  - `get_strategy {}`
  - `list_ideas {weeks?: 1..8}`
  - `search_knowledge {query}`, `read_knowledge {id}`
  - `list_memories {}`
  - `list_posts {status?, limit? ≤50}`, `read_post {id}`
  - `list_templates {type?, category?, search?}`, `read_template {slug}`
  - `create_draft {title ≤120, text ≤5000}`: a new Document with source "assistant"
  - `edit_post {id, text ≤5000, note?}`: a new version through the documents service; the previous version stays restorable
  - `save_idea {title, detail}`: `saveItem` kind IDEA
  - `add_memory {text}` and `update_memory {id, text}`: through the chat's learning guard (find it in `packages/agent/src`, the "learning guard" that blocks false facts); a refusal returns the guard's reason
- No publish, schedule or delete tools exist.

- [ ] **Step 1: Write the failing tests:**
  - `"every tool rejects ids from another profile"`
  - `"edit_post makes a new version and keeps the old one"`
  - `"add_memory goes through the learning guard"`
  - `"no tool name contains publish, schedule or delete"`
  - `"the rate limit answers with the friendly message"`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(mcp): read, draft and edit tools for AI assistants`.

### Task D4: Phase D e2e

**Files:** create `apps/web/e2e/mcp.spec.ts`.

- [ ] **Step 1:** In `mcp.spec.ts`:
  - the settings screen shows the URL and copies it; the tabs switch; the binding select persists after a reload
  - via `request` with the mock header, the MCP `initialize` and then `tools/list` calls list exactly the spec's tools
  - `create_draft` creates a post that appears in /posts
  - without the header, the endpoint answers 401
- [ ] **Step 2:** Run. Expected: pass.
- [ ] **Step 3: Commit** with `test(e2e): AI assistant connector`.

---

## Coordinator steps per phase (not for implementers)

1. Merge the phase branch into `orbit/run` and run the full typecheck plus the unit suites.
2. Back up the real database to `.recon/backups/orbit-<date>-before-<phase>.dump`, then `prisma migrate deploy` on the real database.
3. Rebuild and restart the local :3000 production server.
4. Run the phase's e2e specs.
5. Push `main` with the owner's go-ahead and wait for the Vercel deploy to be READY.
6. Record reference evidence IDs in the local research file.

## Owner actions

- **Phase B:** add `CRON_SECRET` on Vercel (any long random string). Until then, ideas still arrive through the on-demand fallback.
- **Phase D:** in the Clerk dashboard (development instance), turn on OAuth applications and dynamic client registration.
