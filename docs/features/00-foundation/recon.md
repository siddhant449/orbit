# Feature 0 recon: app shell, profiles, teams, settings shell

Captured 2026-10-19 from the user's logged-in Kleo session, read-only. I opened menus and dialogs and closed
them again. Nothing was submitted.

Labels: **observed** = seen on screen or in network traffic; **static** = shipped JavaScript;
**inferred** = my reading, not verified.

Evidence:
- REA trace of `/api/profile` across the whole bundle: `ev_f05990c47c8f8ac6b0ab1316b47afd63ead432e5bdbefce2128f3a3f61558bb1`
  - 7 chunks matched: the settings/team page, the settings page, the activities and ideas pages, and the shared chunks 46295, 59420 and 64596
- Parent bundle evidence: `ev_bc824dc1…` (whole bundle) and `ev_5dcd3a1d…` (page chunks)
- Static strings in the sidebar component chunk `15482-438844b633cd3a88.js` (shared, client-side)

## Layout (observed)

- **Two levels:**
  - A main sidebar, about 210 px wide, that collapses to an icon rail.
  - The content area is a rounded card with a 24 px radius, inset on a light grey page (`kleo-chat-card`).
  - On mobile the sidebar becomes a drawer with a backdrop and a "Close navigation" button (static).
- **Section panels:**
  - Some sections (Ideas, Settings) replace the sidebar with an icon rail plus a second-level panel listing that section's pages.
  - The panel has a title, grouped items, and a "back to menu" link (static).
- **Main sidebar, top to bottom:**
  1. Logo, a search button (opens the command palette) and a collapse toggle.
  2. The **challenge card**: a progress ring, "30-day challenge", "Day 2", "0 of 22 posted", linking to `/challenge`. Its data comes from `GET /api/challenge?view=sidebar`.
  3. The nav: New chat, Posts, Ideas, Activities (with a badge such as "4 left") and Analytics.
  4. **Chat history**, grouped as Pinned / Today / Yesterday / Last 7 days / Last 30 days / Older than last month, with a "See more" link. Data comes from `GET /api/history?limit=20`, which returns `{chats[], hasMore}`.
  5. **Footer:** an avatar with the profile name and a chevron that opens the profile menu.
- **Profile menu** (observed):
  - The team name heading ("Vaibhav's Team")
  - The list of profiles; clicking one calls the server action `setCurrentProfile`
  - "Add new profile", or "Create your profile" when there are none; this goes to `/settings/team?newProfile=1`
  - Settings
  - A light / dark / system theme switch
  - Sign out
- **Command palette** (cmdk, observed): "Search chats…", an Actions group with "Create new chat ⌘J", then chats grouped by date with short dates on the right.
- **Ideas section panel** (observed):
  - Discover: For you · Inspiration · Following · Templates
  - Images: Created by you
  - My library: a "+" button for a new space, and "All saves"
  - Spaces can be renamed, pinned and deleted, and items can be dragged into them (static).
- **Settings section panel** (observed):
  - Account: Integrations `/settings/integrations` · Manage account `/settings` · Memories `/settings/memories` · Manage team `/settings/team` · Billing & subscription `/settings/billing`
  - Support: Community (external link) · Speak to a human `/settings/help`
- **Home header:**
  - A notification bell with a badge (Beamer).
  - The greeting "Good evening, {firstName}" and the title "How can I help?" (observed).
- **Banners** (static):
  - An AI status banner that polls the status pages of Claude, GLM, DeepSeek, Perplexity and Gemini. Its messages scale with severity, e.g. "Our AI provider is having issues…".
  - A "what's new" banner (a Loom link with dismissal stored in localStorage) and a "Meetings" widget (a recurring Strategy Session).

## Endpoints seen in the shell (observed GET responses; field names only)

| Endpoint | Fields |
|---|---|
| `GET /api/account/state` | `teams[{id,name,role,deletedAt,deletionRequestedAt,subscription*,profiles[{id,name,avatarUrl,linkedinConnected,onboardingCompleted,deletedAt,ownerUserId}]}]`, `activeProfileId`, `onboardingComplete`, `onboardingVersion`, `onboarding{step,substep,config,version,complete,progressComplete,tutorialsComplete}`, `subscription{status,expiresAt,priceTier,paused,resumesAt,paidUntil,pauseExtensionsUsed,seats}`, `accessGrantedByTeamId`, `cachedAt` |
| `GET /api/profile` | `{success, profile{id,userId,teamId,name,deletedAt,fullName,jobTitle,company,bio,writingStyle,avatarUrl,affiliateCode,timezone,generationDayOfWeek,language,onboardingCompleted,createdAt,updatedAt}}` |
| `GET /api/history?limit=20` | `{chats[{id,createdAt,title,userId,profileId,visibility,pinned,postId,folderId,lastActivityAt}], hasMore}` |
| `GET /api/challenge?view=sidebar` | `{available,challengeId,challengeTitle,challengeCreatorName,durationDays,totalPostingDays,enrolled,currentDay,completedPostingDays,todayDraftReady,todayTitle,todayHref,todayVideoDuration,todayEstimatedMinutes,todayExampleCount,progressPercent}` |
| `GET /api/subscription` | provider `polar` (Kleo has moved billing from Whop to Polar), `status,expiryDate,cancelledAt,pausedAt,resumesAt,pauseExtensionsUsed,…`, `imageAddonSubscription` |
| `GET /api/user/credits` | `{balance:30, monthlyAllocation:30, lastRefillAt, hasImageAddon}` |
| `GET /api/user-progress` | `{hasWritingStyle,hasIdentity,hasSwipeFile,hasKnowledge,hasTemplates,hasFirstPost,linkedinScrapingRun}` |
| `GET /api/linkedin/status` | `{isConnected,profile,expiresAt,requiresReauthorization}` |
| `GET /api/linkedin/onboarding/status` | `{hasRun,status,enrichmentCompleted,fieldsUpdated[]}` |
| `GET /api/settings/notifications` | `{email{enabled,address}, telegram{available,linked,username,enabled}, whatsapp{available}, pauseAll}` |
| `GET /api/integrations/status` | `{statuses[{provider,displayName,description,logo,isConnected,status}]}`; the logos are hosted by Composio |
| `GET /api/pricing` | monthly at $99 and yearly at $999 (compared with $1,188); a 3 × $333 instalment plan; a buy-now-pay-later flag |

Server actions (static): `setCurrentProfile`, `renewProfile`, `softDeleteProfile`, `inviteUserToTeam`,
`acceptInvitation`, `renewTeam`.

## Settings pages (observed text)

**Manage account** (`/settings`):
- **Profile:** name with an edit pencil, email with "Change", "Upload photo", "Remove".
- **Language:** a select starting English (US), English (UK), Čeština, Dansk, Deutsch, Español… Help text: "Used for AI chat interactions."
- **Timezone:** a select. Help text: "Used for scheduling posts."
- **"How we communicate with you":**
  - a "Pause everything" toggle
  - an Email card with a toggle
  - a Telegram card ("Not linked", Connect)
  - a WhatsApp card ("Coming soon")
  - help text: "Times follow your timezone above. In-app notifications are always on."
- **Account actions:** Security ("Change password"), "Become an affiliate" (Apply), and "Download your data" (Export).

**Manage team** (`/settings/team`):
- **Team name:** an input with Save.
- **Team members:** each member's name, an Owner badge and their email.
- **Invite teammates:** an email input, a role select (Member) and Invite. Help text: "Can only see and work in the profiles they create."
- **LinkedIn profiles:** the profile list with an "Included in plan" badge, and "Add a profile · $49/month".
- **Danger zone:** "Delete team". It cancels subscriptions and marks profiles for deletion; the team can be restored for free until the billing period ends.

**Integrations** (`/settings/integrations`). This is new since the original teardown:
- **Social accounts:** LinkedIn, X, Instagram.
- **AI assistants:**
  - an MCP connection for Codex, Claude, ChatGPT and Cursor
  - the Kleo CLI
  - a Telegram bot
  - WhatsApp (coming soon)
- **Apps**, via Composio: Notion, Google Drive, Google Docs, Gmail, Outlook, Zoom, Google Meet, Fireflies, Fathom,
  Microsoft Teams, Slack, Avoma, Evernote.

## Data model (inferred from the responses)

- **User**: from Clerk.
- **Team**: has an owner, members with roles, and soft delete with `deletionRequestedAt`.
- **Profile**: belongs to a team, has an owner user, and holds:
  - persona fields: fullName, jobTitle, company, bio, writingStyle, avatar
  - settings: language, timezone, generationDayOfWeek
  - flags: onboardingCompleted, linkedinConnected
  - soft delete
- The language and timezone live on the **profile**, not on the user.
- The subscription belongs to the **team**. Seats = number of profiles; each extra profile is $49/month.

## Gaps

- I didn't check the mobile layout live; it's inferred from the class names.
- The translation strings are rendered on the server, so the client code only shows the keys.
- Writes were not exercised: switching, creating or deleting a profile, inviting, saving settings.
