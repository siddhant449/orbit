# Feature 0 design: Foundation (as built)

The approved plan covered this design. The recon in `recon.md` changed the following points.

## Decisions

- **Data model:** User, Team, Membership (OWNER / ADMIN / MEMBER) and Profile.
  - Language and timezone live on the Profile, as in Kleo.
  - Profiles are soft-deleted.
  - `User.currentProfileId` records which profile is active.
- **Who sees which profiles:** members see only the profiles they own; owners and admins see all of them.
  This copies Kleo's "Can only see and work in the profiles they create." Enforced in `packages/db/src/services/account.ts`.
- **First visit:** creates the user, a team called "{First}'s Team" with the user as owner, and a first profile named after the user.
  The Clerk user lookup happens only on that first visit.
- **At least one profile:** deleting the last remaining profile is refused.
- **Next.js 16:** `proxy.ts` replaces middleware.
  - Cache Components is off because every screen is behind sign-in.
  - Tailwind v4 runs through the Turbopack loader.
- **Clerk v7** (Core 3):
  - Keyless mode is disabled, so the app uses your own development keys.
  - The signed-in/signed-out wrapper components are gone; use `<Show>` if one is needed.
- **Look:** our own brand (Brandloop, working name), not Kleo's.
  - Jade accent on a green-grey paper background.
  - Bricolage Grotesque for headings, Schibsted Grotesk for the interface.
  - Tokens live in `packages/ui/src/tokens.css`, with a dark theme.

## Kept from Kleo's structure

- A sidebar with:
  - nav: New chat, Posts, Ideas, Activities, Analytics
  - chat history
  - the profile menu at the bottom
- Section panels for Ideas and Settings, with an icon rail beside them.
- The content area as an inset card.
- A command palette and a theme switch in the profile menu.

## Deferred to later features

- **Feature 2:** chat history data.
- **Feature 8:** the challenge card in the sidebar, and the Activities badge.
- **Feature 9:**
  - invites
  - the email and password screens, notifications and data export (Kleo's Manage account page)
  - billing
- **Feature 2:** the AI status banner.
- **Feature 3:** the notification bell.
