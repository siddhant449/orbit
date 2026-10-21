# Roadmap

Every feature goes through the same loop:
1. REA and Chrome recon, written to `docs/features/NN-*/recon.md`
2. A design for you to approve
3. A plan
4. The build, with frontend-design used for every screen
5. Tests and a side-by-side screenshot check

Working name: **Brandloop** (packages are `@brandloop/*`). It gets renamed once the real brand is chosen.

## 0. Foundation: built, waiting for Clerk keys to verify end to end

- [x] Recon (`docs/features/00-foundation/recon.md`)
- [x] pnpm and Turborepo monorepo:
  - `apps/web`
  - `apps/marketing`
  - `packages/db`, `packages/ui`, `packages/config`
- [x] Postgres in Docker on port 5433, Prisma 7 with User / Team / Membership / Profile, and the account service with 8 passing tests
- [x] Clerk sign-in through `proxy.ts`; the first visit creates the user, the team and the first profile
- [x] App shell:
  - sidebar, icon rail and collapse (⌘B)
  - section panels for Ideas and Settings
  - mobile drawer
  - command palette (⌘K)
  - profile menu: switch profile, add profile, theme, sign out
- [x] Home composer, a placeholder page for every route, and Manage account settings (profile name, language, timezone)
- [x] Manage team: list profiles and delete them, with a guard that keeps at least one
- [ ] End-to-end run: needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `E2E_CLERK_USER_EMAIL`

## 1. Voice and knowledge base

- Profile onboarding, including enriching the profile from LinkedIn (Kleo: `/api/linkedin/onboarding/status`)
- Writing styles: custom, or learned from a URL or pasted posts
- Memories (`/settings/memories`)
- Content-strategy builder: positioning, content mix, audience
- Knowledge base: text, file, URL and video import, sharing

## 2. AI chat and post editor

- Chat home with streaming OpenAI models (via the Vercel AI SDK)
- Chat history grouped by date, with pinned chats and folders
- Fork a chat, delete trailing messages, regenerate a single line
- Tiptap post editor with version history, and a chat for each post
- Voice input
- AI status banner: watches provider status pages and scales its message by severity

## 3. Posts board and scheduling

- Kanban board, list and calendar views, with labels
- LinkedIn OAuth with publish, schedule and repost
- Mention resolution and link previews
- Background jobs with Inngest

## 4. Content library

- Templates
- Inspiration feed
- Saves organised into spaces, with drag-and-drop
- Following

## 5. Weekly ideas

- Weekly generation on the day the user picks
- Paused while the user is doing the challenge

## 6. Visuals

- AI images with edit, revert and version history
- Brand theme, logo compositing and reference images
- Credits (Kleo: 30 per month)

## 7. Analytics

- LinkedIn Community Management API. **Apply for access early.**

## 8. Activities and 30-day challenge

- Streaks, weekly goals, milestones, checklist and routines
- The challenge, with its sidebar card (Kleo: `/api/challenge?view=sidebar`)

## 9. Account, teams and billing

- Invites and roles. Members only see the profiles they created.
- Profile seats (Kleo: $49/month each)
- Billing provider. Kleo now uses Polar, not Whop; our plan is Stripe.
- Pause, resume and cancel; invoices; the image add-on
- Notifications by email and Telegram, data export, change email and password, affiliate program

## 10. Integrations and agents (added after recon)

Kleo's `/settings/integrations` is larger than the original teardown showed. It includes:
- **Social accounts:** LinkedIn, X and Instagram
- **AI-assistant connections:** an MCP connection for Claude, ChatGPT, Codex and Cursor; a command-line tool; a Telegram bot; WhatsApp (coming soon)
- **About 13 app connectors through Composio:** Notion, Google Drive, Gmail, Slack, Zoom, Fireflies and others

## 11. Chrome extension

## 12. Marketing site rebrand
