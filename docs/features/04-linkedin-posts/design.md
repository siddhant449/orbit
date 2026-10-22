# Feature 4 design: LinkedIn connect, publish and schedule, posts backend

Status: **draft for approval, 2026-10-22.** Covers ROADMAP §3 (posts board and scheduling) and the shared infrastructure that
Feature 5 (visuals, `docs/features/05-visuals/design.md`) also uses: `@brandloop/storage`, `@brandloop/jobs` and `@brandloop/email`.

Evidence: `docs/research/kleo-linkedin-posts.md` (cited as **LP §n**), `kleo-ai-architecture.md` (**AA §n**), `kleo-remaining-features.md`
(**RF §n**). LinkedIn API facts come from Microsoft Learn, read 2026-10-22:
- Posts API, default moniker `li-lms-2026-10`, page updated 2026-05-13: <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api>
- Sign In with LinkedIn using OpenID Connect: <https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2>
- Images API, Documents API, little text format and rate limits: the pages linked from the Posts API page. **Re-read each of them in Task L6 and
  record any difference.**

The base is the AI core (`docs/features/02-ai-core/design.md`): `Document` and `DocumentVersion` (one post per chat), the profile scope rule
(`assertProfileAccess`, 404 for another profile's rows) and `BackgroundJob`.

## 1. Intent

The screens in flight (posts board, list and calendar; post editor `/posts/[id]`; carousel studio; analytics) need a real backend:
- posts with a status, labels and a board position
- a LinkedIn connection for each profile
- publish now, schedule, unschedule and reschedule, repost
- mention resolution and link previews
- files for post media

Everything except the real LinkedIn HTTP calls can be built and tested now. LinkedIn keys are not issued yet. Publishing sits behind
`LINKEDIN_PUBLISH_ENABLED` (off by default). Every publish needs an explicit action by the user on that post. **No test, smoke or
dev run ever posts to LinkedIn.**

## 2. Copy, simplify or skip

| Kleo behaviour | Our call |
|---|---|
| Browser navigation to `GET /api/linkedin/auth?returnUrl=` → LinkedIn authorize → `/callback` (LP §1) | **Copy**. `returnUrl` must be a same-origin path (open-redirect guard) |
| Scopes `openid profile email w_member_social` (+ an analytics scope tracked separately) (LP §1) | **Copy** the first four; the analytics scope is requested only when `LINKEDIN_ANALYTICS_ENABLED=1` (blocked, §10) |
| ~60-day tokens, no refresh, 14-day expiry warning, `requiresReauthorization`, `{reconnectRequired:true}` errors (LP §1) | **Copy**. Refresh tokens are stored and used only if LinkedIn issues them (programmatic refresh is partner-only) |
| `POST /api/linkedin/publish {documentId}` queues and returns at once (LP §2) | **Copy** |
| `POST/DELETE /api/posts/schedule {documentId, scheduledAt, timezone}` (LP §2) | **Copy**, plus `PATCH` to reschedule |
| 60-day limit, not after token expiry, no past times, timezone required (LP §2) | **Copy**, enforced on the server as well as in the client |
| 5-minute conflict nudge done only in the client (LP §2) | **Copy the rule, move it to the server**: `GET /api/posts/slots/next?around=` returns the next free slot. A clash is a 409 warning that the client can override with `allowClash:true`. It is never a hard block |
| Durable workflow fields on the post row (`workflowRunId`, `schedulerProvider`, `externalScheduleId`, `schedulerError`) (LP §2) | **Replace** with a `PublishJob` table (§4). The post keeps only display fields |
| Reposts (`/api/reposts/schedule`, `reshareContext.parent`) (LP §2) | **Copy**, in the same `PublishJob` (`kind: REPOST`) |
| Board where the client fetches each card's document (N+1) (LP §4) | **Fix**: one `GET /api/posts-board` returns columns, cards (with excerpt) and labels |
| Board cards that are separate from posts (ideas cards without a post) (LP §4) | **Simplify**: a card *is* a `Document`. Ideas are documents with `status: IDEA` and possibly empty text. Custom columns are stored; status columns are virtual |
| Mentions: `POST /api/linkedin/resolve-mention {url}` → `{urn, displayName, resolved}`; plain-text fallback (LP §3) | **Copy**. Organisation lookup only; person URNs need partner access, so people fall back to plain text, as in Kleo |
| `GET /api/og-metadata?url=` link previews (LP §3) | **Copy**, through the SSRF-safe fetcher (§9) |
| Onboarding import after connect (`/api/linkedin/onboarding`) (LP §1) | **Simplify**: store the name, avatar and locale from `userinfo`. Importing past posts needs `r_member_social` (restricted) → **blocked** |
| Composio LinkedIn toolkit, X, Instagram (LP §1) | **Skip** (ROADMAP §10) |
| Analytics endpoints (LP §5) | **Design the ingestion, mark it blocked** (§10) |
| Agent `confirmReadyToSchedule` / `schedulePost` (AA tools) | **Copy as a card, not an action**: the agent can *propose* a schedule (a card with Schedule / Publish buttons). Only a click calls the route. No agent tool publishes |

## 3. Shape of the system

```
apps/web route handlers (thin)
  ├─ @brandloop/db        posts, labels, board, LinkedInConnection, PublishJob, StorageObject services
  ├─ @brandloop/linkedin  OAuth (authorize URL, code exchange, userinfo), token crypto, REST client
  │                       (posts, images, documents, organisation lookup), little-text formatter, a mock server for tests
  ├─ @brandloop/jobs      enqueue(topic, payload, {notBefore}) + verify(); drivers: qstash | local
  ├─ @brandloop/storage   BlobStore; drivers: upstash (hosted) | local (disk)
  └─ @brandloop/email     EmailSender; drivers: resend | log | memory
```

Publish pipeline:

```
user clicks Publish / Schedule ──► route validates ──► PublishJob(QUEUED, runAt) ──► Document.status = SCHEDULED | PUBLISHING
                                                             │
     QStash cron (every minute) ─► POST /api/jobs/publish-due ─► claim due jobs (FOR UPDATE SKIP LOCKED) ─► enqueue "publish"
     publish now ───────────────────────────────────────────────────────────────────────────────────────► enqueue "publish"
                                                             │
     POST /api/jobs/run (QStash-signed) ─► handlePublish(jobId):
         flag off → FAILED publish_disabled (no HTTP)
         connection missing/expired → FAILED reconnect_required
         upload media (images/documents API) → POST /rest/posts → 201 x-restli-id
         → SUCCEEDED, Document PUBLISHED {linkedinPostUrn, linkedinUrl, publishedAt}; email "published"
         → failure → retry policy (§6.4) or FAILED; email "failed"
```

## 4. Data model (Prisma; profile-scoped)

Migrations are sequential and come after `20261022120000_document_version_proposal`:

| # | Migration | Contents |
|---|---|---|
| 1 | `storage_objects` | `StorageObject` (shared with F5; knowledge `fileKey` moves later, §8) |
| 2 | `posts_status_board_labels` | `DocumentStatus` values, `Document` scheduling and board fields, `BoardColumn`, `Label`, `DocumentLabel`, `PostMedia` |
| 3 | `linkedin_connection` | `LinkedInConnection` |
| 4 | `publish_jobs` | `PublishJob`, `JobKind` additions |

```prisma
enum DocumentStatus { IDEA DRAFT SCHEDULED PUBLISHING PUBLISHED FAILED }   // DRAFT exists; others added
enum PublishSource  { ORBIT EXTERNAL }

model Document {                         // additions only
  scheduledAt        DateTime?
  scheduledTimezone  String?             // IANA, copied from the request (the profile default is pre-filled)
  publishedAt        DateTime?
  publishSource      PublishSource?
  linkedinPostUrn    String?             // urn:li:share:… | urn:li:ugcPost:…
  linkedinUrl        String?             // https://www.linkedin.com/feed/update/<urn>/
  boardColumnId      String?             // only for custom columns; status columns are derived
  boardColumn        BoardColumn? @relation(fields: [boardColumnId], references: [id], onDelete: SetNull)
  boardPosition      Float        @default(0)  // fractional ordering inside a column
  isFavorite         Boolean      @default(false)
  notes              String?             // card notes, plain text, ≤ 4,000
  labels             DocumentLabel[]
  media              PostMedia[]
  publishJobs        PublishJob[]
  @@index([profileId, status, scheduledAt])
}

model BoardColumn { id, profileId, name (1..40), position Float, createdAt;  @@index([profileId, position]) }
model Label       { id, profileId, name (1..32), color String /* token name, not hex */, createdAt;  @@unique([profileId, name]) }
model DocumentLabel { documentId, labelId;  @@id([documentId, labelId]) }

/// Media attached to a post, in order. Either a generated visual (F5) or an uploaded/exported file.
model PostMedia {
  id              String   @id @default(cuid())
  documentId      String   // cascade
  kind            PostMediaKind   // IMAGE | DOCUMENT (carousel PDF) | VIDEO (later)
  storageObjectId String
  visualId        String?  // F5 Visual, when it came from generation
  position        Int
  altText         String?  // ≤ 1,000 (LinkedIn alt text limit; re-check in L6)
  linkedinAssetUrn String? // cached urn:li:image:/urn:li:document: from a previous upload (re-uploaded if the object changed)
  @@unique([documentId, position])
}

model LinkedInConnection {
  id                 String   @id @default(cuid())
  profileId          String   @unique            // one LinkedIn member per profile
  memberSub          String                      // OIDC `sub`; author URN = urn:li:person:<sub>
  name               String
  avatarUrl          String?
  locale             String?
  scopes             String[]
  accessTokenEnc     String                      // v1:<iv b64>:<ciphertext+tag b64>, AES-256-GCM, AAD = profileId
  refreshTokenEnc    String?
  expiresAt          DateTime
  refreshExpiresAt   DateTime?
  requiresReauth     Boolean  @default(false)
  hasAnalyticsScope  Boolean  @default(false)
  connectedAt        DateTime @default(now())
  lastUsedAt         DateTime?
  @@index([memberSub])
}

enum PublishJobKind   { PUBLISH REPOST }
enum PublishJobStatus { QUEUED CLAIMED RUNNING SUCCEEDED FAILED CANCELLED }

model PublishJob {
  id               String   @id @default(cuid())
  profileId        String
  documentId       String?          // PUBLISH
  repostOfUrn      String?          // REPOST: the parent post URN
  kind             PublishJobKind
  runAt            DateTime         // now() for publish-now
  timezone         String
  status           PublishJobStatus @default(QUEUED)
  attempts         Int      @default(0)
  maxAttempts      Int      @default(3)
  errorCode        String?          // publish_disabled | reconnect_required | rate_limited | media_failed | publish_unconfirmed | invalid_post | linkedin_error
  error            String?          // user-safe message
  publishedVersion Int?             // DocumentVersion.version that was sent
  resultUrn        String?
  requestedByUserId String
  idempotencyKey   String  @unique  // client UUID per click; a retried POST is a no-op
  claimedAt        DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([status, runAt])
  @@index([profileId, runAt])
}
// Partial unique index (raw SQL in the migration): one live job per document
// CREATE UNIQUE INDEX "PublishJob_one_live_per_document" ON "PublishJob"("documentId") WHERE status IN ('QUEUED','CLAIMED','RUNNING');
```

How these relate to `Document`:
- `Document.status` is what the board shows.
- `PublishJob` is the source of truth for *what will happen*.
- The two change together in one transaction:

| Transition | Job | Document |
|---|---|---|
| schedule | QUEUED (runAt) | SCHEDULED, scheduledAt |
| unschedule | CANCELLED | DRAFT, scheduledAt null |
| claim (≤ runAt) | CLAIMED → RUNNING | PUBLISHING |
| success | SUCCEEDED | PUBLISHED, publishedAt, urn, url |
| failure (final) | FAILED | FAILED (board shows it in Draft with a red dot; "Try again" re-queues) |

- Editing a SCHEDULED post keeps the schedule. The worker publishes the version that is **current at run time** and records it in
  `publishedVersion`.
- Editing a PUBLISHING or PUBLISHED post is refused: `PATCH /api/documents/:id` → 409 `post_locked`. "Duplicate as draft" is offered instead,
  because LinkedIn edits via `PARTIAL_UPDATE` are out of scope for v1.
- `StorageObject` is defined in §8.

## 5. API routes

`{error}` errors, plus `code` on 409 and 422 (AI core convention). All routes are profile-scoped.

| Route | Purpose |
|---|---|
| `GET /api/posts?status=&label=&q=&from=&to=&cursor=` | list rows `{id,title,excerpt,status,scheduledAt,scheduledTimezone,publishedAt,linkedinUrl,labels[],updatedAt,chatId,mediaCount}` + `counts` |
| `POST /api/posts {title?, text?, status?: IDEA|DRAFT, columnId?}` | new post without a chat (board "Add a post"); chat is linked lazily (existing `linkChatToDocument`) |
| `PATCH /api/posts/:id {title?, notes?, isFavorite?, columnId?, position?, labelIds?}` | card fields; text stays on `/api/documents/:id` |
| `DELETE /api/posts/:id` | soft delete; cancels a live job |
| `POST /api/posts/:id/duplicate` | new DRAFT copy (used for locked posts) |
| `GET /api/posts-board` | `{columns:[{id,name,kind:"status"|"custom",status?}], cards:[…list row + columnKey, position], labels:[]}` in one round trip |
| `POST/PATCH/DELETE /api/posts-board/columns[/:id]`, `POST …/columns/reorder` | custom columns |
| `GET/POST/PATCH/DELETE /api/labels[/:id]` | labels |
| `GET /api/posts/calendar?from&to` | `{posts:[…], reposts:[…]}` in the profile timezone window, ≤ 62 days |
| `GET /api/posts/slots/next?around=ISO&timezone=` | next free slot (5-minute rule, Kleo search order: hour→23, 9→hour, 6–8) |
| `POST /api/posts/:id/schedule {scheduledAt, timezone, idempotencyKey, allowClash?}` | → 200 `{job}`; 409 `slot_clash {conflicts}`; 422 `too_far` / `in_past` / `after_token_expiry` / `timezone_required` / `empty_post` / `post_too_long`; 409 `reconnect_required`; 409 `already_scheduled` |
| `PATCH /api/posts/:id/schedule {scheduledAt, timezone}` | reschedule a QUEUED job (same rules) |
| `DELETE /api/posts/:id/schedule` | unschedule → DRAFT |
| `POST /api/posts/:id/publish {idempotencyKey}` | publish now (job with runAt=now). 503 `publish_disabled` when the flag is off, and **no job is created** |
| `POST /api/posts/:id/retry` | FAILED → new job (new idempotency key from the server) |
| `GET /api/posts/:id/publish-status` | `{status, job:{status,errorCode,error,runAt,attempts}, linkedinUrl}`; the editor polls every 3 s while PUBLISHING |
| `POST /api/reposts/schedule {originalPostUrn|documentId, scheduledAt, timezone, idempotencyKey}`, `PATCH`, `DELETE` | reposts |
| `GET /api/linkedin/auth?returnUrl=` | 302 to LinkedIn (state cookie, §7); 503 `linkedin_not_configured` without client id |
| `GET /api/linkedin/callback?code&state` | exchange, `userinfo`, encrypt, upsert, 302 `returnUrl?linkedin=connected|denied|error` |
| `GET /api/linkedin/status` | `{isConnected, profile:{name,avatarUrl}|null, expiresAt, expiresInDays, requiresReauthorization, hasAnalyticsScope, publishEnabled}` |
| `POST /api/linkedin/disconnect` | revoke (best effort) + delete row; QUEUED jobs stay and will fail `reconnect_required` unless reconnected; the response lists them |
| `POST /api/linkedin/resolve-mention {url}` | `{urn|null, displayName, profileUrl, resolved}` |
| `GET /api/og-metadata?url=` | `{title, description, image, url}`; cached 24 h in Redis |
| `POST /api/jobs/run` | QStash target for every topic; verifies the signature; dispatches by topic |
| `POST /api/jobs/publish-due` | QStash cron target; claims due jobs and enqueues `publish` |
| `POST /api/files` (multipart) / `GET /api/files/:id` | post media upload; authenticated file read (§8) |

Validation of a schedule request:
- `now + 2 min ≤ scheduledAt ≤ now + 60 days`
- `scheduledAt < connection.expiresAt − 1 h`
- the timezone is a valid IANA zone (`Intl.supportedValuesOf('timeZone')`)
- the post has 1..3,000 chars after mention formatting
- ≤ 20 images or 1 document, never both. LinkedIn single-image or multiImage, documents alone; re-check in L6.

## 6. Jobs: `@brandloop/jobs`

### 6.1 Decision: QStash with a database-backed due sweep, plus a local driver

- **Scheduled publish**: the `PublishJob` row is the schedule. A QStash **schedule** (cron `* * * * *`) calls `POST /api/jobs/publish-due`.
  The route claims up to 25 rows with `status=QUEUED AND runAt <= now()` and runs `FOR UPDATE SKIP LOCKED`. It sets them CLAIMED and enqueues one
  `publish` message each.
  - **Why not one delayed QStash message per post:**
    - The maximum delay QStash accepts depends on the plan and can be shorter than our 60 days.
    - Reschedule and cancel would need message deletes that can race.
    - A lost message would lose a post silently.
  - **With the sweep:**
    - Reschedule and cancel are plain row updates.
    - Precision is about 1 minute. LinkedIn shows minute precision anyway.
    - A missed tick is caught up by the next one.
- **Publish now and image generation (F5)**: `enqueue(topic, payload)` publishes a QStash message to `/api/jobs/run` with `retries: 3`.
  QStash gives at-least-once delivery, backoff and a dead-letter queue. A slow image job does not hold a user request open.
  - **Why not Kleo's in-process approach** (`after()` + poll): `after()` work dies with the instance, has no retries, and is bounded by the function timeout.
  - Clients still **poll** our own status endpoints, as in Kleo. The job driver is invisible to them.
- **Local dev and tests** (`JOBS_DRIVER=local`, the default when `NODE_ENV !== "production"`), for when QStash can't reach localhost:
  - `enqueue` calls the same `handle(topic, payload)` through `after()`.
  - In dev only, `apps/web/src/instrumentation.ts` starts a 30-second interval that calls the same `publishDue()` function.
  - Tests call `publishDue()` and `handle()` directly with a fake clock.
- **Production**: `JOBS_DRIVER=qstash`. The QStash schedule is created once by `pnpm --filter @brandloop/jobs setup:schedules`, which is idempotent
  and keyed by `scheduleId`.

### 6.2 Interface

```ts
type Topic = "publish" | "visual.generate" | "visual.edit" | "email.send";
type JobDriver = {
  enqueue(topic: Topic, payload: JsonValue, opts?: { dedupeId?: string; notBefore?: Date }): Promise<{ messageId: string }>;
};
function createJobDriver(env = process.env, deps?: { handle?: Handler; qstash?: QStashLike }): JobDriver;
function verifyQStashRequest(req: Request, env = process.env): Promise<{ ok: true; body: string } | { ok: false }>;
// Uses @upstash/qstash Receiver with QSTASH_CURRENT_SIGNING_KEY + QSTASH_NEXT_SIGNING_KEY. It checks the signature over the raw
// body and the URL. In qstash mode an unsigned request gets 401. The local driver never goes through HTTP.
function registerHandlers(map: Partial<Record<Topic, (payload: unknown, meta: { messageId: string; attempt: number }) => Promise<void>>>): Handler;
```

`dedupeId` maps to QStash `deduplicationId`. It is `publish:<jobId>:<attempt>` and `visual:<generationId>:<op>`.

### 6.3 Idempotency

Every handler is idempotent at the database level:
- **`handlePublish(jobId)`:**
  - Moves the job from CLAIMED or QUEUED to RUNNING (compare-and-set on `status` and `attempts`).
  - A duplicate delivery finds RUNNING, SUCCEEDED or CANCELLED and returns 200 without doing anything.
  - A RUNNING job older than 10 minutes is treated as crashed and becomes `publish_unconfirmed` (§6.4), never re-sent.
- **The route** returns 200 for handled, ignored or final-failure outcomes. It returns 5xx only for transient infrastructure errors, so that QStash retries.

### 6.4 Publish retry policy (double-post safety)

LinkedIn offers no idempotency key. Without `r_member_social` we cannot list our own posts to check for a duplicate.

| Outcome | Action |
|---|---|
| 201 + `x-restli-id` | SUCCEEDED |
| Error before the request was sent (DNS, connect refused, our media upload failed) | retry; backoff 1, 5, 15 min; max 3 attempts |
| 429 | retry after `Retry-After` (cap 15 min); counts as an attempt |
| 401, or 403 `ACCESS_DENIED` | FAILED `reconnect_required`; connection `requiresReauth=true` |
| 400, 422 (`FIELD_LENGTH_TOO_LONG`, `INVALID_*`) | FAILED `invalid_post` with LinkedIn's message mapped to our copy |
| 5xx, timeout, or reset **after** the body was sent | FAILED `publish_unconfirmed`. Copy: "LinkedIn didn't confirm this post. Check your profile before trying again." No automatic retry |

Media is uploaded first, and its URNs are cached on `PostMedia`. A retry therefore re-sends only `POST /rest/posts`.

## 7. LinkedIn: `@brandloop/linkedin`

### 7.1 OAuth (OpenID Connect + Share on LinkedIn)

Developer app products: **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.

- **Authorize:** `https://www.linkedin.com/oauth/v2/authorization` with `response_type=code`, `client_id`, `redirect_uri=<APP_URL>/api/linkedin/callback`,
  `scope=openid profile email w_member_social`, `state`, `nonce`.
- **State (CSRF):** 32 random bytes, base64url. The cookie is `orbit_li_oauth`, a signed (HMAC-SHA256 with `TOKEN_ENCRYPTION_KEY`-derived key) JSON
  value `{state, nonce, profileId, userId, returnUrl, exp: now+10min}`, set `HttpOnly; Secure; SameSite=Lax; Path=/api/linkedin`.
- **Callback checks:**
  - the cookie is present and unexpired
  - `state` matches (constant-time compare)
  - `profileId` is still the caller's current profile (otherwise 400 "Profile changed during sign-in")
  - the cookie is cleared on every outcome
  - `error=user_cancelled_authorize` → `?linkedin=denied`
- **Exchange:** `POST https://www.linkedin.com/oauth/v2/accessToken` (form) returns `access_token`, `expires_in` (≈ 60 days), `scope` and
  `id_token`, plus `refresh_token`/`refresh_token_expires_in` only for apps LinkedIn has enabled for programmatic refresh.
- **Identity:** `GET https://api.linkedin.com/v2/userinfo` returns `sub, name, given_name, family_name, picture, locale, email?`.
  - Validating the ID token against JWKS is optional, because userinfo is authoritative over TLS. We check `id_token.nonce` matches when present.
  - Author URN is `urn:li:person:<sub>`. Verify in L6 against the Share on LinkedIn docs that `sub` is the member id used in `author`.
- **One member, one profile:** if another profile *of the same team* already holds that `memberSub`, the callback refuses with "This LinkedIn
  account is connected to <profile name>." A LinkedIn member is never shared across two profiles. Across teams this is allowed (it is not visible).

### 7.2 Tokens at rest

- `TOKEN_ENCRYPTION_KEY` is 32 random bytes, base64. It is validated at start-up when LinkedIn is configured.
- Encryption is AES-256-GCM (`node:crypto`) with a random 12-byte IV per encryption, a 16-byte tag, and AAD = `profileId`. A row copied to another
  profile does not decrypt.
- Stored form: `v1:<iv>:<ct||tag>`. The `v1` prefix allows key rotation: `TOKEN_ENCRYPTION_KEY_PREVIOUS` is tried on decrypt, and the row is
  re-encrypted with the current key.
- Tokens are never logged and never returned by any route, and they appear in no error message.

### 7.3 Expiry and refresh

- `status.expiresInDays` is shown when it is under 14 days. The UI copy is "Reconnect LinkedIn so scheduled posts keep publishing."
- A daily sweep, a QStash cron `0 6 * * *` calling `POST /api/jobs/linkedin-expiry`, does three things:
  - Refreshes a token within 7 days of expiry when a refresh token exists (`grant_type=refresh_token`).
  - Otherwise, emails once at 7 days and again at 1 day, through `@brandloop/email`.
  - Flags scheduled jobs whose `runAt` falls after `expiresAt`. They stay QUEUED, the board shows a warning, and reconnecting clears it.
- At publish time, an expired token, or a 401, means `requiresReauth=true`.
- Disconnect calls `POST https://www.linkedin.com/oauth/v2/revoke` (best effort), then deletes the row.

### 7.4 REST client

Every call sends these headers:
- `Authorization: Bearer`
- `LinkedIn-Version: ${LINKEDIN_API_VERSION}` (default `202610`)
- `X-Restli-Protocol-Version: 2.0.0`

The version is env-configurable. Version 202511 sunsets on 2026-11-16 (Posts API notice). The client has a 20 s timeout and records whether the
body was sent.

- **`createPost`:** `POST https://api.linkedin.com/rest/posts`. A 201 response puts the post URN in the `x-restli-id` header. The body:

  ```json
  {"author":"urn:li:person:<sub>","commentary":"<little text>","visibility":"PUBLIC",
   "distribution":{"feedDistribution":"MAIN_FEED","targetEntities":[],"thirdPartyDistributionChannels":[]},
   "lifecycleState":"PUBLISHED","isReshareDisabledByAuthor":false,
   "content": {"media":{"id":"urn:li:image:…","altText":"…"}} | {"multiImage":{"images":[{"id","altText"}]}} | {"media":{"id":"urn:li:document:…","title":"…"}} }
  ```
- **`repost`:** the same call with `reshareContext.parent`.
- **`uploadImage` / `uploadDocument`:** `POST /rest/images?action=initializeUpload` (and the documents equivalent) with
  `{initializeUploadRequest:{owner:"urn:li:person:<sub>"}}`. The response is `{value:{uploadUrl, image|document}}`. Then `PUT` the bytes to
  `uploadUrl`. The bytes come from `@brandloop/storage`; LinkedIn never fetches our URLs.
  - The `uploadUrl` host must be `*.linkedin.com` or `*.licdn.com`. Any other host is rejected, as an SSRF and token-leak guard. The bearer token
    is sent only to `api.linkedin.com`.
- **`lookupOrganization(vanity)`:** `GET /rest/organizations?q=vanityName&vanityName=`. Re-check the access tier in L6. If it needs more than
  `w_member_social`, mention resolution returns `resolved:false` for everything.
- **Little text format:** `commentary` is LinkedIn's "little" format.
  - `toLittleText(text, mentions)` escapes reserved characters (`\ | { } @ [ ] ( ) < > # * _ ~`) in plain text.
  - It writes mentions as `@[Name](urn:li:organization:…)`. The visible name must match the entity name exactly, or LinkedIn renders it as text.
  - Hashtags are written as `#word`, unescaped, only for `#` followed by a word character at a word start.
  - Snapshot tests cover each reserved character. The same function feeds the 3,000-char check.
- **Mentions in the editor:** stored inline in `DocumentVersion.text` as `@[Name](urn:li:organization:123)`, the exact LinkedIn syntax. The editor
  (`components/editor/post-format.ts`) renders that token as a chip. Unresolved people are plain text. No separate mention table.
- **Rate limits:**
  - LinkedIn enforces per-member and per-app daily limits. Read the current numbers in the developer portal's Analytics tab once the app exists,
    and record them in L6.
  - Our own guard is ≤ 25 publishes per profile per 24 h and ≤ 1 publish per profile per minute, checked in the worker through the Upstash Redis
    sliding window. It is a soft fail: the job is re-queued 2 minutes later.

### 7.5 Mock LinkedIn for tests

`@brandloop/linkedin/testing` exports `createMockLinkedIn()`:
- An in-memory fake `fetch` that implements the authorize redirect, token exchange, userinfo, revoke, images and documents initializeUpload and
  PUT, posts, and organization lookup.
- Scripted failures: `429` with Retry-After, `401`, `400 FIELD_LENGTH_TOO_LONG`, `500 after body`, network error before send, timeout.
- A record of every call, so tests can assert what was sent.

The REST client takes `fetch` by injection. A test-only guard makes any real `api.linkedin.com` or `www.linkedin.com` request throw when
`NODE_ENV=test` or `VITEST` is set, so a test that forgot the mock fails loudly.

### 7.6 The publish flag and per-post consent

- `LINKEDIN_PUBLISH_ENABLED` is read on every request and in the worker. When it is anything but `"true"`:
  - The publish and schedule routes still validate the request.
  - Publish returns 503 `publish_disabled` without creating a job.
  - Scheduling **is allowed** (it is only a row), but the board marks scheduled items "Publishing is off".
  - A worker that claims a job while the flag is off marks it FAILED `publish_disabled` and makes no HTTP call.
- The agent has **no** publish or schedule tool. It may emit a `data-schedule-proposal` part `{documentId, scheduledAt, timezone}`. The UI renders it
  as a card with the Schedule and Publish buttons, which call the routes after a click.
- The publish dialog shows the exact text and media that will be sent (the little-text preview) and the account name.

## 8. Storage: `@brandloop/storage` (shared with F5)

```ts
type PutOpts = { contentType: string; visibility: "public" | "private"; cacheControl?: string };
type BlobStore = {
  put(key: string, bytes: Buffer, opts: PutOpts): Promise<{ key: string; url: string | null }>; // url only for public
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string | null;
};
function createBlobStore(env = process.env): BlobStore;   // STORAGE_DRIVER = upstash | local (default local outside production)
```

- **Hosted adapter `upstash`** (user confirmed: Upstash Blob, bucket `orbit`, currently PUBLIC, token `UPSTASH_BLOB_TOKEN`):
  - Primary SDK: `@upstash/blob` (`new Bucket({ token })`, `put(key, file) → {url}`, `get`, `del`), **if** pnpm's release-age policy accepts its
    current version.
  - If it is refused, pin an older exact version that the policy accepts. If none exists, use `@aws-sdk/client-s3` against Upstash's
    S3-compatible endpoint (`UPSTASH_BLOB_S3_ENDPOINT` plus S3 credentials from the Upstash console). Never add `minimumReleaseAgeExclude`.
  - The adapter is the only file that imports either SDK.
- **Local adapter `local`:** disk under `.data/blob/<key>`, with the key regex guard as today's `localUploadStore`. Public URLs are
  `/api/files/public/<key>`, served by a dev-only route; in production that route returns 404. Tests use a temp dir.
- **Keys:** `p/<profileId>/<kind>/<random 128-bit base64url>.<ext>`, for example `p/ck…/visual/9fJ….png`. Keys are unguessable and never contain
  user text.
- **Public vs private:** the hosted bucket is public, so anything in it is readable by anyone who has the URL.
  - **Public (unguessable URL):** generated visuals, carousel PDFs, post media and the brand logo. These are meant for LinkedIn and the feed preview
    anyway. They are served by their bucket URL with `Cache-Control: public, max-age=31536000, immutable`. Edits get a new key; nothing is
    overwritten.
  - **Private:** knowledge uploads and reference images.
    - These are **never** written to the public bucket.
    - Until the user decides (preflight D1), the private store is the local-disk adapter, in production too. That means a single instance or a
      mounted volume.
    - They are served only through `GET /api/files/:id`, which checks profile access (`StorageObject.profileId`) and streams the bytes with
      `Cache-Control: private, no-store`.
    - Options for the user: a second, private Upstash bucket (`UPSTASH_BLOB_PRIVATE_TOKEN`), or a private S3-compatible bucket.
- **`StorageObject`:** `{id, profileId, teamId, key @unique, store: PUBLIC|PRIVATE, kind: KNOWLEDGE|VISUAL|REFERENCE|LOGO|POST_MEDIA|CAROUSEL_PDF,
  contentType, bytes, sha256, width?, height?, createdAt, deletedAt?}`.
  - Every put records a row in the same service call. If the database write fails, the blob is deleted.
  - Deleting a post or visual soft-deletes its objects. A daily job (`storage.gc`, QStash cron) removes blobs that have been deleted for 7 days and
    are not referenced by `PostMedia` or `VisualVersion`.
- **Uploads:**
  - `POST /api/files` (post media: JPG, PNG, GIF, WebP ≤ 8 MB; PDF ≤ 100 MB) reuses `verifyUpload` magic-byte checks.
  - Images are re-encoded with `sharp` to strip metadata, longest side ≤ 4,096 px.
- **Knowledge migration:** `uploadStore` (local disk today) becomes a `BlobStore` with `visibility: "private"`. It is a thin wrapper, so the
  current tests keep passing. Old `fileKey`s stay readable by a fallback path. No data move is needed while both are on local disk.

## 9. Security

- **Profile scope:** every query is scoped by `profileId`. Job handlers re-load the job and check that its `profileId` owns the document and the
  connection, so they never trust the payload.
- **QStash:**
  - In qstash mode, `/api/jobs/*` verify the signature over the raw body and the URL, using both the current and next keys (rotation).
  - The payload contains only ids.
  - Routes are excluded from Clerk auth in `proxy.ts`, but only these paths.
- **OAuth:** signed state cookie with a 10-minute expiry, a same-origin `returnUrl` (must start with `/`, not `//`, no scheme), and the profile
  binding described in §7.1.
- **SSRF** (`og-metadata`, mention URL parsing, any future remote image): one `safeFetch(url)` in `@brandloop/knowledge` (the URL extractor
  already fetches; it moves there and is reused). It does all of the following:
  - allows only `https:`, or `http:` in dev
  - resolves DNS and rejects private, loopback, link-local, CGNAT, multicast and metadata ranges (IPv4 and IPv6)
  - connects to the resolved IP (no re-resolve, so no DNS rebinding)
  - follows at most 3 redirects, each re-checked
  - stops at 5 s and 2 MB
  - allows only the content types `text/html` or `image/*`
  - sends a `User-Agent: OrbitBot/1.0`
- **Mentions:** the URL must be `https://www.linkedin.com/company/<vanity>` or `/in/<vanity>` (parsed, never fetched).
- **Tokens:** see §7.2. Clerk user deletion and team deletion cascade to `LinkedInConnection`, and revoke is called first.

## 10. Analytics (blocked)

Needs the Community Management API (`r_member_postAnalytics`, member follower statistics). The design is ready so that O8 can wire to it once
access is granted:
- **`LinkedInPostMetric`:**
  - fields: `{profileId, postUrn, metric: IMPRESSION|MEMBERS_REACHED|REACTION|COMMENT|RESHARE|POST_SAVE|LINK_CLICKS|…, value, day, fetchedAt}`
    (enum names as LP §5)
  - unique key: `(postUrn, metric, day)`
- **`LinkedInFollowerSnapshot`:** `{profileId, day, followers}`.
- **Sync job:** `analytics.sync` per connected profile with `hasAnalyticsScope`, nightly plus on demand. A 48 h cache rule (LP §5). It sets a
  `degraded` flag while running.
- **Routes:** `/api/analytics/{access,overview,followers,posts,post}`, shaped as LP §5.
- **Plan:** only `GET /api/analytics/access` is built (it returns `connected/hasAnalyticsScope/needsReconnect`), so the O8 empty states are real.
  Everything else is a task stub marked **BLOCKED**.

## 11. Email: `@brandloop/email`

```ts
type Email = { to: string; subject: string; text: string; html?: string; tag: "post-published" | "post-failed" | "linkedin-expiring" | "approval-request" };
type EmailSender = { send(e: Email): Promise<{ id: string } | { skipped: string }> };
function createEmailSender(env = process.env): EmailSender; // EMAIL_DRIVER = resend | log | memory
```

- **Drivers:**
  - `resend` is used only when `EMAIL_DRIVER=resend` **and** `NODE_ENV=production`, or when the recipient is on `EMAIL_ALLOWLIST`.
    Outside production, any other recipient is `{skipped: "not allowlisted"}`.
  - `log` is the default in dev. It prints the subject and recipient domain only.
  - `memory` is the test default and is the only driver e2e uses. It exposes `sent[]`.
  - Resend's API key is `RESEND_API_KEY`. The sender is `EMAIL_FROM` (needs a verified domain, preflight).
- **Sending:** emails are sent through `enqueue("email.send")`, so a slow provider never blocks a publish.
- **Templates:** plain text plus a minimal HTML, with our own copy:
  - published: "Your post is live on LinkedIn" + link
  - failed: the reason + "Open post"
  - expiring: the reconnect link
  - approval request: see below
- **"Request approval"** in the editor is a later item (teams and roles, ROADMAP §9). The `approval-request` template and tag are reserved; no
  route is built in this feature.

## 12. Testing

- **Unit:**
  - little-text formatter (every reserved character, mentions, hashtags, emoji, 3,000-char boundary)
  - token crypto (round trip, wrong AAD fails, tamper fails, rotation)
  - state cookie (expiry, tamper, wrong profile)
  - schedule validator (timezones, DST edges, 60 days, token expiry, clash)
  - `nextFreeSlot`
  - retry classifier
- **DB:**
  - posts, board, labels and `PublishJob` transitions
  - `claimDue` concurrency: two parallel claims over 10 due jobs give each job to exactly one claimer
  - partial unique index (two live jobs for one post → conflict)
- **Worker:** `handlePublish` against `createMockLinkedIn()` covering every row of §6.4, duplicate delivery, flag off (zero HTTP calls asserted),
  disconnected, media upload then post, cached media URN reuse.
- **Routes:** web route tests with the mock LinkedIn, the local job driver, the local blob store and the memory email driver. The QStash signature
  is tested with real `Receiver` keys generated in the test.
- **e2e** (the controller runs them): connect is mocked by seeding a `LinkedInConnection` row (`E2E_LINKEDIN_FAKE=1` makes `/api/linkedin/auth`
  302 straight to the callback with a fake code handled by the mock, **only when `NODE_ENV !== "production"`**). Specs cover schedule from the
  editor, the board moving to Scheduled, unschedule, and publish with the flag off showing the disabled state.
- **No live LinkedIn call ever.** Once keys exist, the only manual check is connect, status and disconnect on a test LinkedIn account (no post).
  Even then, `LINKEDIN_PUBLISH_ENABLED` stays off until the user enables it and publishes one post themselves.

## 13. Out of scope

- LinkedIn post editing and deleting after publish (`PARTIAL_UPDATE`, `DELETE`).
- Organisation (company page) posting (`w_organization_social`).
- Video upload.
- Polls.
- First-comment automation: the editor's "first comment" row needs `w_member_social` comments via the Social Actions API. That is possible, but
  deferred, and shown as "Coming soon".
- Best-time suggestions (need analytics).
- X and Instagram.
- Approvals.

## 14. Risks

1. **LinkedIn app review.** Share on LinkedIn and OIDC are self-serve. Community Management is not, so analytics may never unlock for a new app.
2. **`sub` as the person id.** LinkedIn documents `subject_types_supported: pairwise`. L6 must confirm that `urn:li:person:<sub>` is accepted as
   `author`. Fallback: none documented. If it fails, the first manual check (no post) will show it on `initializeUpload` with `owner`.
3. **Public bucket.** Anything put there is world-readable by URL. The adapter refuses `visibility:"private"` on the public bucket (it throws).
4. **QStash cron precision** is about a minute. Kleo has the same class of behaviour.
5. **Local private store in production** is single-instance. That is acceptable for a beta; D1 resolves it.
