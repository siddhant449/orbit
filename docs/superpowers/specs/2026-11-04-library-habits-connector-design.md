# Library, habits and the AI assistant connector: design

Date: 2026-11-04 · Status: awaiting approval · Scope: seven features the owner picked from the gap list.

## Why

Orbit already writes good posts. What's missing is the scaffolding that makes people come back weekly:
- a place to keep what they like (Saves)
- ideas waiting for them every week (For you)
- their own reusable formats (own templates)
- a reason to post every weekday (the 30-day challenge, goals and to-dos)
- a nudge when something is ready (the bell)
- a way to use Orbit from the AI assistant they already work in (the MCP connector)

All of it must work **before LinkedIn is connected**, and keep AI spend tiny (Luna only, see cost rules).

## Cross-cutting rules (owner decisions)

- **What counts as "posted"** until LinkedIn connects: a post counts once the user clicks **Mark as posted** on it. This stores `Document.postedAt`; the user can undo it. The challenge, streaks and the posts goal all count from `postedAt`. When LinkedIn sync arrives, published posts set it automatically.
- **Cost.** Only Luna runs (code guard 7b4d4e2). New AI calls in this design:
  - weekly ideas: one call per active profile per week
  - "save post as template": one call per click

  Nothing else here calls a model.
- **Scope.** Everything is per profile (Orbit's existing unit), except where noted. No team sharing in this round.
- **No sample data.** Empty states explain what will appear (existing ruling).
- **Publishing.** Never through any feature here, including MCP.
- **Done means:** unit tests, one Playwright e2e per feature on the test database in mock mode, and reference evidence recorded locally.

## 1. Saves / My library ("spaces")

**What the user sees.**
- **All saves** (`/saves`) lists everything saved, newest first, with a type filter: Templates and hooks · Ideas · Posts · Images.
- The sidebar shows spaces under "My library", with a **+** to create one.
- A space has:
  - a name (up to 30 characters; the reference uses 15, which is too tight for real names)
  - an optional description (up to 500)
  - a pin, which puts it at the top
  - rename and delete. Deleting a space keeps its items in All saves.
- Every saveable thing gets a **Save ▾** control: save to All saves, or into a space.
  - Saveable things: template cards, hook cards in chat, idea cards, post cards and rows in Posts, and images in the image library.
  - An item can be in several spaces.
  - Unsaving removes it everywhere.
- Inside a space, items can be dragged to reorder, or moved to another space with a "Move to…" menu that works by keyboard.

**Data.**
- `SaveSpace {id, profileId, name, description?, pinned, position, createdAt}`
- `SavedItem {id, profileId, kind: TEMPLATE|HOOK|IDEA|POST|VISUAL, refId?, snapshot Json, createdAt}`
  - `snapshot` keeps hook and idea text, which have no row of their own.
  - Templates, posts and images reference their row by `refId`. Deleted targets show as "No longer available" with Remove.
- `SavedItemSpace {itemId, spaceId, position}`.
- Template saves already live in `TemplateSave`. Migrate them into `SavedItem` (kind TEMPLATE) and keep one source of truth.

**Out of scope:** team-shared spaces, cover images.

## 2. Weekly ideas ("For you")

**What the user sees.**
- The Ideas → For you page shows **this week's 5 ideas**, each made from a different piece of the profile's own material (strategy pillar, knowledge item, story, memory), like today's generateIdeas picker.
- Each card shows category, title and a one-line detail, with **Draft**, **Save** and **Hide**.
  - **Draft** opens a new chat seeded with the idea, which writes straight away (the existing idea-pick flow).
  - The card then shows "Drafted".
  - Hidden ideas go into a "Hidden" section with Restore.
- Earlier weeks are listed below, collapsed by week.
- The page shows "New ideas every Monday" (the generation day) with a change control. Changes are limited to 3 a week.

**When ideas are made.**
- A daily cron (the Vercel Hobby plan allows daily) makes the batch for profiles where:
  - today, in the profile's timezone, is their generation day, and
  - there is no batch for this week yet, and
  - someone signed in within the last 14 days, so inactive profiles cost nothing.
- Opening For you with no batch this week (a new user, a missed cron) makes it on demand, once.
- A failure leaves the page saying "This week's ideas didn't arrive. Try again", with a button. It never retries in a loop.

**Data.**
- `Idea {id, profileId, weekStartOn date, category, title, detail, prompt, sourceKind, sourceRef?, drafted, chatId?, hidden, createdAt}`.
- A unique key on `(profileId, weekStartOn, position)` keeps the cron idempotent.
- Ideas generated in chat (the picker) are saved here too, with `weekStartOn` of the current week, so they stop vanishing with the tab.

**Cost:** one Luna call per active profile per week, about $0.01.

## 3. Own templates

**What the user sees.**
- **+ New template** on the Templates page opens a form with:
  - name, type (Hook or Post) and category (the existing categories)
  - the skeleton: text with `[slots]`, with a live preview highlighting the slots
  - "why it works" (one line, optional)
- **Save as template** on any of the user's posts (the post menu): one Luna call turns the post into a skeleton with `[slots]` plus a suggested name and category. The user reviews and edits it in the same form before saving. Nothing is saved unless they confirm.
- Own templates show "You" as the author, can be edited and deleted (deleting asks first), and appear in search and in the writer's template auto-pick like the built-in ones.
- **Counts:** every template card shows a heart (like/unlike) and "Used N times".
  - Sort options: Popular (likes plus uses in the last 30 days, then all time) · Newest.
  - Likes and uses are counted across all users for built-in templates, and per owner for own templates (private).

**Data.**
- Reuse `Template` (`system=false`, `profileId` = owner) and `TemplateUse`.
- Add `TemplateLike {templateId, profileId}`, and cached `likeCount` / `useCount` on `Template`, updated in the same transaction.

## 4. 30-day challenge (real)

**What the user sees.**
- **Start the challenge** (today or a chosen start date) stores an enrollment. The 30 calendar days run from that date.
  - Weekdays are posting days; weekends are "Rest · No post planned".
  - There are 22 posting days. Orbit has 23 formats, so 22 are used and the weakest-fit one is dropped.
- Each posting day shows:
  - its format, a two-line brief and "~25 min"
  - a status: Upcoming · Today · In progress (a draft started from that day) · Posted (marked as posted) · Missed (a past weekday with nothing posted)
- **Continue** opens that day's chat, which is today's sprint prompt.
- **Catch up**: on a missed day, it opens the same chat. Posting a missed day's post counts for that day.
- The banner warns "You've missed N days. Posting today still counts".
- **End challenge** (with a confirmation) stores `endedAt`. A finished challenge shows a summary with posted count and best streak, and **Start again**.
- The sidebar card shows "30-day challenge · Day N · x of 22 posted", or "Not started".

**Data.**
- `ChallengeEnrollment {id, profileId, startDate, endedAt?, completedAt?}`
- `ChallengeDay {enrollmentId, dayNumber, formatId, documentId?, postedAt?}`, created at start.

**Out of scope:** creator videos, community sharing, leaderboard, history assessment.

## 5. Activities: goals, to-dos, milestones

**What the user sees.**
- **This week's goals** (Edit) cover posts, comments, DMs and connection requests.
  - Presets:
    - **Momentum** (3 / 25 / 5 / 10)
    - **Growth** (5 / 50 / 10 / 50)
    - **Creator** (7 / 70 / 15 / 35)
    - Custom numbers
  - The posts goal counts marked-as-posted posts.
  - Comments, DMs and connections have **+1** and −1 buttons, with a note: "Counted by you until LinkedIn is connected".
- **Streak:** consecutive weeks where the posts goal was met, computed in the profile's timezone. The card shows "x of y posts this week" and warns on the last day of the week when the goal isn't met yet.
- **To-dos (+ Add activity):**
  - fields: title, optional note, and a repeat setting (one-off · every weekday · every week on day X)
  - a missed one-off carries over to the next day, marked "from yesterday"
  - repeating to-dos can be skipped for today, or paused for up to 28 days
  - drag or keyboard reorder
  - a done tick, and the day strip counts done/total
- **Milestones:** badges are awarded once and stored. A first set:
  - first post
  - 5, 10 and 25 posts
  - first full week, a 4-week streak
  - challenge finished
  - first template
  - first space
  - 10 ideas drafted

  "All badges" shows locked and unlocked badges.
- **Getting started** stays as it is (derived).

**Data.**
- `WeeklyGoal {profileId, preset, posts, comments, dms, connections}`
- `GoalTally {profileId, weekStartOn, kind, count}`
- `Task {id, profileId, title, note?, repeat, weekday?, position, pausedUntil?, createdAt}`
- `TaskDone {taskId, date, status: DONE|SKIPPED}`
- `Badge {profileId, badgeId, awardedAt}`

## 6. What's New bell

**What the user sees.**
- The bell in the top bar shows a dot when there's something unread. It opens a popover with two kinds of rows.
- **Derived rows**, worked out from current state each time:
  - today's challenge day
  - this week's ideas waiting
  - the next getting-started step
- **Stored events**, saved as they happen:
  - "This week's ideas are ready"
  - "Your image is ready"
  - "Badge earned: First post"
  - "Your challenge ends in 3 days"
- Stored events have read/unread. Opening the popover marks the visible ones read. Each row links to the place it's about. "Mark all read".
- Events older than 30 days are deleted by the daily cron.

**Data:** `Notification {id, profileId, kind, title, href, createdAt, readAt?}`.

## 7. AI assistant connector (MCP)

**What the user sees.**
- Settings → Integrations → **AI assistants** has tabs for Claude, ChatGPT, Cursor and Codex. Each tab gives:
  - the server URL (`<origin>/api/mcp`, Streamable HTTP)
  - copy buttons
  - the exact steps for that assistant: the Claude Code command, the Cursor deep link, ChatGPT/Claude connector instructions
- Sign-in happens in the assistant with Orbit's own login. There are no keys to copy.
- **Which profile it acts as:** a select ("AI assistants act as: <profile>"), stored per user and changeable.
- A list of connected assistants, each with **Disconnect**.

**Tools** (owner chose read + drafts + edits; never publish, never delete):
- **read**
  - `get_strategy`, `list_ideas`, `search_knowledge`, `read_knowledge`
  - `list_memories`, `list_posts`, `read_post`, `list_templates`, `read_template`
- **write**
  - `create_draft` (text and title; saved as a new post with source "assistant")
  - `edit_post` (saves a new version; the previous version stays restorable)
  - `save_idea`
  - `add_memory` and `update_memory`, through the same learning guard the chat uses, so no false facts get in
- Every call is per profile and goes through the same rate limits as chat. Tool output never includes other profiles' data.

**How:**
- the Vercel `mcp-handler` package for the endpoint
- Clerk as the OAuth provider (`@clerk/mcp-tools`: protected-resource metadata and token verification)
- `McpBinding {userId, profileId}`

**Owner action needed:** turn on OAuth applications with dynamic client registration in the Clerk dashboard. It's one toggle on the development instance; I'll give exact steps.

**Out of scope:** the CLI, the Telegram bot and app integrations. They need outside keys.

## Build order (two at a time, lean)

1. **Saves + own templates.** They share save controls and template counters, and come with one migration.
2. **Weekly ideas + the bell.** The cron and the "ideas ready" event go together.
3. **Challenge + Activities.** They share Mark as posted, `postedAt` and badges.
4. **MCP connector**, last: it reads everything above.

Each step: back up the database, deploy the migration, merge, rebuild locally, run the e2e for that feature, and deploy to Vercel with the owner's go-ahead.

## Left to the builder

- Exact component structure.
- Animation, within the existing Orbit motion rules: a subtle fade only.
- Copy polish, within the existing tone.
- Query shapes.
- Badge artwork: simple icons from the existing set.
