# Feature 4: LinkedIn connect, publish and schedule, posts backend: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the in-flight posts screens (board, list, calendar, editor `/posts/[id]`, carousel) a real backend:
- posts with status, labels and board order
- file storage
- background jobs
- a LinkedIn connection for each profile
- schedule, publish and repost, built to completion against a mocked LinkedIn, and behind `LINKEDIN_PUBLISH_ENABLED`, which is off
- mention resolution and link previews
- transactional email

**Architecture:** four new packages, plus `@brandloop/db` services and thin `apps/web` route handlers. The new packages:
- `@brandloop/storage` (BlobStore: upstash | local)
- `@brandloop/jobs` (JobDriver: qstash | local, QStash signature verification)
- `@brandloop/email` (EmailSender: resend | log | memory)
- `@brandloop/linkedin` (OAuth, token crypto, REST client, little-text formatter, mock)

Scheduled publishing is a `PublishJob` table, swept every minute by a QStash cron. Locally, an in-process interval calls the same function.

**Spec:** `docs/features/04-linkedin-posts/design.md`. Evidence: `docs/research/kleo-linkedin-posts.md`. The base is the AI core plan
(`docs/features/02-ai-core/plan.md`) and its Global Constraints, which all apply here unless a line below overrides them.

**Tech stack additions** (exact pinned versions; release-age policy: never `minimumReleaseAgeExclude`, pin an older exact version if refused):
- `@upstash/blob`. Fallback: `@aws-sdk/client-s3` (design §8).
- `@upstash/qstash`
- `@upstash/redis`
- `resend`
- `sharp` (already transitively present via Next; add explicitly to `@brandloop/storage`)

## Global Constraints (in addition to the AI core's)

- **Never a live LinkedIn call.** Tests inject `fetch` through `createMockLinkedIn()`. `assertNoRealLinkedIn()` throws on any real `*.linkedin.com`
  request under `VITEST`/`NODE_ENV=test`.
  - There is no smoke task for LinkedIn publishing.
  - Once keys exist, the only allowed manual check is connect → status → disconnect on the user's say-so.
  - `LINKEDIN_PUBLISH_ENABLED` stays unset in every `.env` the agents touch.
- **No agent publish tool.** The agent can only emit a `data-schedule-proposal` part, and a human click calls the route.
- **Email:** tests use `EMAIL_DRIVER=memory`; dev uses `log`. No test sends through Resend. Outside production, Resend sends only to `EMAIL_ALLOWLIST`.
- **Jobs:** tests use `JOBS_DRIVER=local` and call handlers directly. No test reaches QStash.
- **Storage:** tests use `STORAGE_DRIVER=local` with a temp root. No test writes to the hosted bucket. The hosted adapter gets one manual smoke
  (put, get, delete of a 1×1 PNG under `p/smoke/…`, then delete), printing only status codes.
- **Private files never go to the public bucket.** The upstash adapter throws on `visibility: "private"`.
- **Profile scope everywhere.** Job handlers re-load rows by id and check `profileId`; they never trust the payload.
- **Migrations, in order** (each `prisma migrate dev --name …`; a second run reports nothing pending):
  1. L1 `storage_objects`
  2. L4 `posts_status_board_labels`
  3. L7 `linkedin_connection`
  4. L8 `publish_jobs`

  Feature 5's migrations follow these.
- **Shared files with in-flight branches:** `packages/db/src/services/documents.ts` and its test are also edited on `orbit/posts-board`
  (`listPosts`, `PostSummary`). New post services go in a **new** `packages/db/src/services/posts.ts`. `documents.ts` gets only the additive
  status-lock check (L4). `packages/db/src/index.ts` changes are one-line exports. Rebase conflicts there are export lines only.
- **Error shape:** `{error}` plus `code` on 409 and 422 (design §5).

## Review Focus

1. **A post is published twice.** Causes: a duplicate QStash delivery, two sweeps, a double click, a retried request, or a 5xx after the body was
   sent. The requirement: at most one `POST /rest/posts` per job, and an ambiguous outcome becomes `publish_unconfirmed` with no retry. Tests: L8, L9.
2. **Something publishes without consent.** The flag is off, the post belongs to another profile, an agent tool tries it, or a forged
   `/api/jobs/run` call arrives. The requirement: zero LinkedIn HTTP calls, 401 for unsigned job calls in qstash mode, 404 across profiles.
   Tests: L2, L8, L9, L11.
3. **Tokens leak or cross profiles.** Responses, logs and errors never contain a token. Ciphertext moved to another profile fails to decrypt, and a
   forged or expired state cookie is refused. Tests: L6, L7.
4. **Schedule edge cases:** DST transitions, the 60-day boundary, after token expiry, a past time, a 5-minute clash (a warning, overridable),
   rescheduling a job that is already claimed (409). Tests: L8.
5. **Private files are exposed.** Knowledge or reference uploads must never reach the public bucket, and `/api/files/:id` must be a 404 for other
   profiles. Tests: L1.
6. **SSRF through link previews or mention URLs:** private IPs, redirects to private IPs, DNS rebinding, oversized bodies. Tests: L10.

## Order and gates

| # | Task | Migration | Live smoke | Gate after |
|---|---|---|---|---|
| L1 | `@brandloop/storage`, `StorageObject`, `/api/files` | storage_objects | hosted put/get/delete (1 object) | unit |
| L2 | `@brandloop/jobs` (local + qstash), `/api/jobs/run` | — | — | unit |
| L3 | `@brandloop/email` | — | — (no send) | unit |
| L4 | Posts model: status, board, labels, media; services | posts_status_board_labels | — | unit |
| L5 | Posts, board, labels and calendar routes + `posts-api` client | — | — | **controller: wire the posts-board branch, e2e** |
| L6 | `@brandloop/linkedin` core (crypto, state, OAuth, REST, little text, mock) | — | — | unit |
| L7 | `LinkedInConnection`, auth/callback/status/disconnect, expiry sweep | linkedin_connection | — | unit |
| L8 | `PublishJob`, schedule rules, schedule/publish/repost routes, slots | publish_jobs | — | unit |
| L9 | Publish worker, due sweep, retry policy, rate guard, notifications | — | — | **controller: e2e (mock LinkedIn)** |
| L10 | `safeFetch`, link previews, mention resolution | — | 1 og fetch of a public page | unit |
| L11 | Agent schedule proposal card + editor wiring hooks | — | — | controller: chat e2e |
| L12 | Analytics access route (built) + sync design stubs (BLOCKED) | — | — | unit |
| L13 | End-to-end and close-out | — | manual connect/status/disconnect **only if keys exist and the user says so** | **controller: full suite** |

---

### Task L1: `@brandloop/storage`, `StorageObject`, file routes

**Files:**
- Create: `packages/storage/{package.json,tsconfig.json,vitest.config.ts}`, `packages/storage/src/{index.ts,types.ts,keys.ts,local.ts,upstash.ts,create.ts,image.ts}` and tests `{keys,local,create,image}.test.ts`
- Modify: `packages/db/prisma/schema.prisma` (`StorageObject`, enums `StorageStore {PUBLIC PRIVATE}`, `StorageKind`)
- Create: `packages/db/src/services/storage-objects.ts` (+ test)
- Modify: `packages/knowledge/src/upload-store.ts` (wrap a private BlobStore; keep the `UploadStore` type)
- Create: `apps/web/src/app/api/files/route.ts` (POST), `apps/web/src/app/api/files/[id]/route.ts` (GET, DELETE), `apps/web/src/app/api/files/public/[...key]/route.ts` (dev only), `apps/web/src/lib/storage.ts`
- Modify: `apps/web/next.config.ts` (`transpilePackages`, `serverExternalPackages: ["sharp"]` if needed), `.env.example` (`STORAGE_DRIVER`, `STORAGE_LOCAL_ROOT`, `UPSTASH_BLOB_TOKEN`, `UPSTASH_BLOB_PRIVATE_TOKEN` (commented, pending D1))

**Interfaces:**
- `type Visibility = "public" | "private"`
- `type BlobStore` (design §8)
- `createBlobStore(env): { public: BlobStore; private: BlobStore }`, where:
  - `public` is upstash in production when `UPSTASH_BLOB_TOKEN` is set, else local
  - `private` is local (until D1)
- `objectKey(profileId, kind, ext): string` gives `p/<profileId>/<kind>/<22-char base64url>.<ext>`. It validates the `profileId` charset.
- `normaliseImage(bytes, opts?: { maxSide?: number; format?: "png" | "jpeg" | "webp" }): Promise<{ bytes; contentType; width; height }>`. It strips
  metadata and rotates by EXIF.
- **db `storage-objects.ts`:**
  - `recordObject(input): Promise<StorageObject>`
  - `getObject(profileId, id)`
  - `softDeleteObject(profileId, id)`
  - `listGcCandidates(olderThan: Date)`
- `apps/web/src/lib/storage.ts`:
  - `storeFile(profileId, teamId, kind, bytes, contentType): Promise<{ id; url | null }>` puts, then records. If recording fails, it deletes the blob.
  - `readFile(profileId, id)`

- [ ] **Step 1: Check the dependency.** Run `pnpm view @upstash/blob time --json` and try `pnpm add @upstash/blob@<exact>` in `packages/storage`.
  - If the release-age policy refuses it, pin an older accepted exact version.
  - If none is accepted, implement `upstash.ts` on `@aws-sdk/client-s3` (endpoint and credentials from env) and record that in the report.
  - Re-read the SDK's `.d.ts` for `Bucket`, `put`, `get` and `del`.
- [ ] **Step 2: Migrate.** `prisma migrate dev --name storage_objects`, run twice.
- [ ] **Step 3: Write the failing tests.**

```ts
// keys.test.ts
it("builds unguessable profile-scoped keys and rejects traversal", () => {
  expect(objectKey("ckabc123", "visual", "png")).toMatch(/^p\/ckabc123\/visual\/[A-Za-z0-9_-]{22}\.png$/);
  expect(() => objectKey("../x", "visual", "png")).toThrow();
});
// local.test.ts (temp dir)
it("round-trips bytes and content type, deletes idempotently, and refuses keys outside the root", async () => { /* … */ });
it("returns a /api/files/public URL only for public puts", async () => { /* private put → url null */ });
// create.test.ts
it("refuses a private put on the upstash adapter", async () => {
  const { public: pub } = createBlobStore({ STORAGE_DRIVER: "upstash", UPSTASH_BLOB_TOKEN: "t", NODE_ENV: "production" }, { bucket: fakeBucket() });
  await expect(pub.put("p/x/knowledge/a.pdf", buf, { contentType: "application/pdf", visibility: "private" })).rejects.toThrow(/private/);
});
it("defaults to local outside production even with a token", () => { /* … */ });
// image.test.ts
it("strips EXIF/GPS and caps the longest side at 4096", async () => { /* sharp metadata has no exif, width ≤ 4096 */ });
// storage-objects.test.ts (DB)
it("hides another profile's object", async () => { /* getObject(p2, id) === null */ });
// web route test: apps/web/src/app/api/files/files.test.ts
it("GET /api/files/:id streams a private object with no-store to its owner and 404s for another profile", async () => { /* … */ });
it("POST /api/files rejects a PNG that is really a ZIP (415) and a 9 MB image (413)", async () => { /* … */ });
```

- [ ] **Step 4: Run the tests.** Expected: FAIL.
- [ ] **Step 5: Implement.** Knowledge `localUploadStore` keeps its signature and delegates to the private local BlobStore, so the existing tests
  must stay green.
- [ ] **Step 6: Run the tests and the checks** (storage, db, knowledge, web typecheck and lint). Expected: PASS.
- [ ] **Step 7: Live smoke (hosted, once, by hand).** `pnpm --filter @brandloop/storage smoke` puts a 1×1 PNG at `p/smoke/visual/<rand>.png`,
  fetches its URL (expects 200), deletes it, and fetches again (expects 404 or 403). It prints status codes only.
- [ ] **Step 8: Commit.** `feat(storage): blob store with upstash and local adapters, storage objects, file routes`

**Review focus:** no private put can reach the public adapter; there are no orphan blobs on a database failure; the dev public route is 404 in
production.

---

### Task L2: `@brandloop/jobs`

**Files:**
- Create: `packages/jobs/{package.json,tsconfig.json,vitest.config.ts}`, `packages/jobs/src/{index.ts,types.ts,local.ts,qstash.ts,verify.ts,registry.ts}` and tests
- Create: `packages/jobs/scripts/setup-schedules.ts` (idempotent: `publish-due` `* * * * *`, `linkedin-expiry` `0 6 * * *`, `storage-gc` `30 3 * * *`; it refuses to run unless `JOBS_DRIVER=qstash` and `APP_URL` is https)
- Create: `apps/web/src/app/api/jobs/run/route.ts`, `apps/web/src/lib/jobs.ts` (the handler registry; later tasks add topics), `apps/web/src/instrumentation.ts` (dev interval, only when `JOBS_DRIVER=local && NODE_ENV=development`)
- Modify: `apps/web/src/proxy.ts` (public matcher for `/api/jobs/(.*)` only), `.env.example` (`JOBS_DRIVER`, `APP_URL`)

**Interfaces:**
- From design §6.2: `Topic`, `JobDriver`, `createJobDriver`, `verifyQStashRequest`, `registerHandlers`.
- `withJobRoute(handler)` wraps a route handler:
  - verifies the signature in qstash mode (401 otherwise)
  - parses `{topic, payload}`
  - maps handler outcomes to responses: `ok`, `ignored` and `final-failure` give 200; a thrown `TransientJobError` gives 503

- [ ] **Step 1:** Re-read the `@upstash/qstash` `.d.ts` for `Client.publishJSON` (`url`, `body`, `retries`, `deduplicationId`, `notBefore`),
  `Client.schedules.create` and `Receiver.verify` (`signature`, `body`, `url`). Record the names.
- [ ] **Step 2: Write the failing tests.**

```ts
it("local driver runs the handler after the call returns, with attempt 1", async () => { /* … */ });
it("qstash driver publishes to APP_URL/api/jobs/run with retries 3 and the dedupe id", async () => { /* fake client records args */ });
it("verify accepts a body signed with the current or the next key and rejects a tampered body or wrong url", async () => {
  /* sign with jose HS256 per QStash's JWT format using test keys; Receiver from the SDK */ });
it("job route: unsigned request in qstash mode → 401, handler not called", async () => { /* … */ });
it("job route: TransientJobError → 503; other errors → 200 with final-failure logged by message only", async () => { /* … */ });
```

- [ ] **Step 3: Implement.** Run tests and checks. Commit `feat(jobs): job driver with qstash and local modes, signed job route`.

**Review focus:** `/api/jobs/*` are the only routes outside Clerk auth; the payload is ids only; dev interval never starts in production or test.

---

### Task L3: `@brandloop/email`

**Files:** `packages/email/src/{index.ts,resend.ts,log.ts,memory.ts,templates.ts}` + tests. `.env.example` gets `EMAIL_DRIVER`, `EMAIL_FROM` and
`EMAIL_ALLOWLIST`. A topic `email.send` is added in `apps/web/src/lib/jobs.ts`.

**Interfaces:** from design §11:
- `createEmailSender`
- `renderEmail(tag, data): { subject; text; html }`, which covers `post-published`, `post-failed`, `linkedin-expiring` and `approval-request`
  (reserved).
- `sendLater(email)` enqueues `email.send`.

- [ ] **Step 1:** Re-read the `resend` `.d.ts` (`emails.send({from,to,subject,text,html})`).
- [ ] **Step 2: Tests.**
  - The memory driver records sends.
  - Resend outside production skips a non-allowlisted recipient (the fake client is never called).
  - Resend in production calls the client once.
  - The log driver never prints the full address.
  - Templates escape HTML in post titles.
- [ ] **Step 3: Implement.** Run checks. Commit `feat(email): email sender with resend, log and memory drivers`.

**Review focus:** no path sends to a real person from dev or tests.

---

### Task L4: Posts model: status, board, labels, media

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (design §4: `DocumentStatus` values, `PublishSource`, `Document` additions, `BoardColumn`, `Label`, `DocumentLabel`, `PostMedia`, `PostMediaKind`)
- Create: `packages/db/src/services/posts.ts` (+ `posts.test.ts`), `packages/db/src/services/board.ts` (+ test), `packages/db/src/services/labels.ts` (+ test), `packages/db/src/services/post-media.ts` (+ test)
- Modify: `packages/db/src/services/documents.ts`: `saveDocumentVersion`/`restoreDocumentVersion` throw `DocumentError("locked")` when the status is PUBLISHING or PUBLISHED. This adds `"locked"` to the code union.

**Interfaces:**
- **`posts.ts`:**
  - `type PostRow = { id; title; excerpt (≤ 220 chars of current text); status; scheduledAt; scheduledTimezone; publishedAt; linkedinUrl; labels: {id,name,color}[]; updatedAt; chatId; mediaCount; columnId: string | null; position: number; isFavorite }`
  - `listPosts(profileId, filter: { status?: DocumentStatus[]; labelId?; q?; from?; to?; cursor?; limit? }): Promise<{ posts: PostRow[]; counts: Record<"IDEA"|"DRAFT"|"SCHEDULED"|"PUBLISHED"|"FAILED", number>; nextCursor }>`. It uses a
    single query plus one current-version query, never N+1. `q` searches the title, plus the text with ILIKE.
  - `createPost(profileId, { title?, text?, status?: "IDEA"|"DRAFT", columnId? })`: an IDEA may have empty text, stored as a v1 with an empty
    string. The documents validator is relaxed to allow `""` only for IDEA.
  - `updatePostCard(profileId, id, patch)`
  - `softDeletePost(profileId, id)`
  - `duplicatePost(profileId, id)`
  - `calendarPosts(profileId, from, to)`: the range is ≤ 62 days, otherwise `invalid`.
- **`board.ts`:**
  - `getBoard(profileId): Promise<{ columns; cards: PostRow[]; labels }>`. Status columns are virtual: All, Ideas, Draft, Scheduled, Published.
  - `createColumn`, `renameColumn`, `deleteColumn` (cards fall back to their status column), `reorderColumns(ids[])`, `moveCard(profileId, id, { columnKey: "status:DRAFT" | "custom:<id>", beforeId?, afterId? })`.
    `moveCard` computes the fractional position and renormalises when the gap is under 1e-6.
  - Dragging into a status column can change the status only between IDEA and DRAFT. Dragging to Scheduled or Published returns
    `invalid` ("Schedule it from the post"), so scheduling always goes through L8.
- **`labels.ts`:** CRUD, `setPostLabels(profileId, postId, labelIds)` (≤ 10 per post, ≤ 50 per profile).
- **`post-media.ts`:**
  - `attachMedia(profileId, postId, { storageObjectId, kind, visualId?, altText? })`, `reorderMedia`, `setAltText`, `detachMedia`
  - Rules: ≤ 20 images, or exactly 1 document, never both (`invalid`).

- [ ] **Step 1: Migrate.** `posts_status_board_labels`, run twice.
- [ ] **Step 2: Write the failing tests.**

```ts
it("lists posts with labels, excerpt and counts in two queries", async () => { /* spy prisma $on('query') count ≤ 3 */ });
it("allows an empty IDEA, refuses an empty DRAFT", async () => { /* … */ });
it("moves a card between two others and keeps order stable across 50 inserts (renormalises)", async () => { /* … */ });
it("refuses to drag a draft into Scheduled", async () => { /* code invalid */ });
it("refuses a document plus an image on one post, and a 21st image", async () => { /* … */ });
it("locks text edits while PUBLISHING or PUBLISHED", async () => { /* saveDocumentVersion → DocumentError locked */ });
it("hides other profiles' posts, columns and labels", async () => { /* … */ });
```

- [ ] **Step 3: Implement.** Run tests and checks. Commit `feat(db): post status, board columns, labels and post media`.

**Review focus:** no N+1; status changes into SCHEDULED or PUBLISHED are impossible from board services; existing documents tests still green.

---

### Task L5: Posts, board, labels and calendar routes, plus the client

**Files:**
- Create the routes from design §5 (posts, posts-board, labels, calendar, duplicate) under `apps/web/src/app/api/…`
- Create: `apps/web/src/lib/posts-api.ts` (typed fetchers + zod response schemas, mirroring `documents-api.ts`) and `posts-api.test.ts`
- Modify: `apps/web/src/app/api/documents/[id]/route.ts` (409 `post_locked` mapping)

**Interfaces:**
- Route bodies are validated with zod. Lists cap `limit` at 200.
- `posts-api.ts` exports `fetchBoard`, `fetchPosts`, `createPost`, `updatePost`, `movePostCard`, `fetchCalendar`, `labels.*`. These are what the
  `orbit/posts-board` branch wires to.

- [ ] **Step 1: Write route tests** (Clerk mocked as in existing web route tests).
  - Board shape snapshot.
  - Calendar range > 62 days → 422.
  - A PATCH with another profile's id → 404.
  - A locked post text PATCH → 409 `post_locked`.
- [ ] **Step 2: Implement.** Run checks. Commit `feat(web): posts, board, labels and calendar routes`.
- [ ] **Gate:** the controller merges the `orbit/posts-board` UI and replaces its fixtures with `posts-api.ts`, then runs the posts e2e.

**Review focus:** response shapes match what the posts-board branch renders (read its `components/posts/*` before finalising field names).

---

### Task L6: `@brandloop/linkedin` core

**Files:**
- Create: `packages/linkedin/src/{index.ts,config.ts,crypto.ts,state.ts,oauth.ts,client.ts,little-text.ts,mentions.ts,errors.ts,guard.ts}`, `packages/linkedin/src/testing/mock.ts` and tests for each
- Create: `docs/features/04-linkedin-posts/linkedin-api-notes.md`: the re-read facts with links and dates. This is an input record, not a report.

**Interfaces:**
- `linkedinConfig(env)` gives `{ clientId, clientSecret, redirectUri, apiVersion: env.LINKEDIN_API_VERSION ?? "202610", publishEnabled: env.LINKEDIN_PUBLISH_ENABLED === "true", configured: boolean }`.
- **`crypto.ts`:** `encryptToken(plain, aad)`, `decryptToken(stored, aad)`, `TokenCryptoError`. Rotation through `TOKEN_ENCRYPTION_KEY_PREVIOUS`
  (design §7.2).
- **`state.ts`:** `createOAuthState({profileId,userId,returnUrl}, now): { cookie: string; state: string; nonce: string }`,
  `readOAuthState(cookie, state, now): OAuthState | null`, `safeReturnUrl(raw): string`.
- **`oauth.ts`:**
  - `authorizeUrl(cfg, {state, nonce, scopes})`
  - `exchangeCode(cfg, code, fetch)` returns `{accessToken, expiresAt, refreshToken?, refreshExpiresAt?, scopes, idToken?}`
  - `fetchUserInfo(token, fetch)`
  - `refreshAccessToken(cfg, refreshToken, fetch)`
  - `revokeToken(cfg, token, fetch)`
- **`client.ts`:** `createLinkedInClient({ token, apiVersion, fetch })` returns `{ createPost(body): Promise<{urn}>, uploadImage(ownerUrn, bytes, contentType): Promise<{urn}>, uploadDocument(ownerUrn, bytes, title): Promise<{urn}>, lookupOrganization(vanity): Promise<{urn,name}|null> }`.
  - Errors are `LinkedInError { status; code: LinkedInErrorCode; retryAfterSec?; bodySent: boolean }`. The client checks the `uploadUrl` host.
- **`little-text.ts`:** `toLittleText(text): string`. It escapes reserved characters and leaves `@[Name](urn:li:organization:…)` tokens and
  hashtags intact. `littleLength(text)`.
- **`mentions.ts`:** `parseLinkedInUrl(url): { kind: "company" | "person"; vanity } | null`.
- **`testing/mock.ts`:** `createMockLinkedIn(opts)` returns `{ fetch, calls, script(failures) }` (design §7.5).
- **`guard.ts`:** `assertNoRealLinkedIn(fetchImpl)`.

- [ ] **Step 1:** Re-read and write `linkedin-api-notes.md` (Posts, Images, Documents, little text format, organization lookup, OAuth, revoke,
  rate limits) with today's `LinkedIn-Version`. Record any difference from the design.
- [ ] **Step 2: Write the failing tests.**

```ts
it("encrypts with a fresh IV each time, decrypts with the same AAD, fails with another profile's AAD or a flipped byte", () => { /* … */ });
it("decrypts a v1 value made with the previous key", () => { /* … */ });
it("state cookie: expired, tampered, or state mismatch → null; returnUrl '//evil.com' → '/'", () => { /* … */ });
it("authorize URL has the four scopes, state, nonce and the exact redirect", () => { /* … */ });
it("escapes every reserved character but keeps mentions and hashtags", () => {
  expect(toLittleText("a_b *c* (d) @[Acme](urn:li:organization:1) #growth")).toBe("a\\_b \\*c\\* \\(d\\) @[Acme](urn:li:organization:1) #growth");
});
it("createPost sends the version and restli headers and returns x-restli-id", async () => { /* mock asserts headers */ });
it("classifies 429 with retry-after, 401, 400 FIELD_LENGTH_TOO_LONG and a 500 after the body as bodySent:true", async () => { /* … */ });
it("refuses an uploadUrl on a non-LinkedIn host and never sends the bearer token there", async () => { /* … */ });
it("assertNoRealLinkedIn throws on api.linkedin.com under vitest", async () => { /* … */ });
```

- [ ] **Step 3: Implement.** Run checks. Commit `feat(linkedin): oauth, token crypto, rest client, little text and a mock`.

**Review focus:** no token in thrown messages (assert `String(err)` lacks the token); constant-time state compare; headers exact.

---

### Task L7: `LinkedInConnection`, connect routes, expiry sweep

**Files:**
- Modify: `schema.prisma` (`LinkedInConnection`, design §4). Migration `linkedin_connection`.
- Create: `packages/db/src/services/linkedin-connection.ts` (+ test)
- Create: `apps/web/src/app/api/linkedin/{auth,callback,status,disconnect}/route.ts`, `apps/web/src/app/api/jobs/linkedin-expiry/route.ts`, `apps/web/src/lib/linkedin.ts` (deps: config, fetch, crypto, clock)

**Interfaces:**
- `upsertConnection(profileId, teamId, input)` returns `CONNECTED_ELSEWHERE` when another profile in the team holds `memberSub`.
- `getConnection(profileId)` returns `{…, accessToken()}`, which decrypts lazily.
- `markReauth(profileId)`
- `deleteConnection(profileId)`
- `connectionsExpiringBefore(date)`
- `publicStatus(conn, now, cfg)`
- `E2E_LINKEDIN_FAKE=1` (non-production only) makes `auth` 302 straight to `callback?code=fake&state=…`, and the callback uses the mock exchange.

- [ ] **Step 1: Migrate** (twice).
- [ ] **Step 2: Tests.**
  - The callback with a valid state stores an encrypted token and no plaintext in the row.
  - The callback with a profile switched mid-flow → 400.
  - A missing or expired cookie → 400.
  - `error=user_cancelled_authorize` → redirect `?linkedin=denied`.
  - Status never includes token fields (deep scan of the JSON).
  - Disconnect revokes once and deletes, and the response lists QUEUED jobs.
  - `auth` without a client id → 503 `linkedin_not_configured`.
  - Expiry sweep:
    - refreshes when a refresh token exists
    - otherwise sends exactly one 7-day email (memory driver) and records `expiryNotifiedAt`. This adds a field `expiryNoticeStage Int @default(0)`
      to the migration.
- [ ] **Step 3: Implement.** Run checks. Commit `feat(linkedin): connect, status, disconnect and expiry sweep`.

**Review focus:** cookie flags; open redirect; the same LinkedIn member on two profiles of one team is refused.

---

### Task L8: `PublishJob`, schedule rules, schedule, publish and repost routes

**Files:**
- Modify: `schema.prisma` (`PublishJob`, enums; the raw SQL partial unique index added to the generated migration). Migration `publish_jobs`.
- Create: `packages/db/src/services/publish-jobs.ts` (+ test), `packages/linkedin/src/schedule.ts` (+ test: pure rules)
- Create: `apps/web/src/app/api/posts/[id]/{schedule,publish,retry,publish-status}/route.ts`, `apps/web/src/app/api/posts/slots/next/route.ts`, `apps/web/src/app/api/reposts/schedule/route.ts`

**Interfaces:**
- **`schedule.ts`** (pure, takes `now`):
  - `validateSchedule({ scheduledAt, timezone, now, tokenExpiresAt, textLength, media }): { ok: true } | { ok: false; code: "in_past"|"too_far"|"after_token_expiry"|"timezone_required"|"empty_post"|"post_too_long"|"media_invalid" }`
  - `findClashes(at, scheduled: Date[], minutes = 5)`
  - `nextFreeSlot(around, timezone, taken: Date[]): Date` (the Kleo search order, design §5)
- **`publish-jobs.ts`:**
  - `schedulePost(profileId, userId, docId, { runAt, timezone, idempotencyKey }): Promise<PublishJob>`: one transaction (job QUEUED,
    Document SCHEDULED). The same `idempotencyKey` returns the existing job. A live job for that post → `already_scheduled`.
  - `reschedule(profileId, docId, runAt, tz)`: QUEUED only, otherwise `job_in_progress` (409).
  - `unschedule(profileId, docId)`: QUEUED only. CLAIMED or RUNNING → 409 `job_in_progress`.
  - `publishNow(profileId, userId, docId, key)`: job with `runAt = now`, Document PUBLISHING.
  - `scheduleRepost(...)`
  - `claimDue(now, limit = 25): Promise<PublishJob[]>`: raw SQL `UPDATE … SET status='CLAIMED', "claimedAt"=now WHERE id IN (SELECT id … WHERE status='QUEUED' AND "runAt" <= now ORDER BY "runAt" LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`.
  - `startRun(jobId)`: compare-and-set CLAIMED|QUEUED → RUNNING, `attempts += 1`. Returns null when it is not claimable.
  - `succeed(jobId, { urn, url, version })`, `fail(jobId, { code, error, retryAt? })`
  - `recoverStuck(now)`: RUNNING older than 10 min → FAILED `publish_unconfirmed`.
- **Routes:**
  - The publish route checks `linkedinConfig().publishEnabled` **before** creating a job, so a disabled flag gives 503 `publish_disabled` and
    no row.
  - Schedule works with the flag off (design §7.6). The response includes `publishEnabled:false`.

- [ ] **Step 1: Migrate** (twice). Check that the partial index exists (`\d "PublishJob"`).
- [ ] **Step 2: Write the failing tests.**

```ts
// schedule.test.ts (pure)
it("accepts exactly 60 days ahead, refuses 60 days + 1 minute", () => { /* … */ });
it("refuses a time after the token expiry minus one hour", () => { /* … */ });
it("handles the DST gap: 02:30 on a spring-forward day in America/New_York is refused as nonexistent local time", () => { /* … */ });
it("finds a clash within 5 minutes and suggests the next free hour in Kleo's order", () => { /* … */ });
// publish-jobs.test.ts (DB)
it("a retried schedule POST with the same idempotency key returns the same job", async () => { /* … */ });
it("a second live job for the same post violates the partial unique index → already_scheduled", async () => { /* … */ });
it("claimDue: two concurrent claimers over 10 due jobs claim each job exactly once", async () => {
  const [a, b] = await Promise.all([claimDue(now, 25), claimDue(now, 25)]);
  expect(new Set([...a, ...b].map((j) => j.id)).size).toBe(10); expect(a.length + b.length).toBe(10);
});
it("unschedule after claim → job_in_progress, document stays PUBLISHING", async () => { /* … */ });
// routes
it("publish with the flag off → 503 publish_disabled and no PublishJob row", async () => { /* … */ });
it("schedule with a clash → 409 slot_clash; with allowClash → 200", async () => { /* … */ });
it("schedule without a connection → 409 reconnect_required", async () => { /* … */ });
it("another profile's post → 404 for schedule, publish, retry and status", async () => { /* … */ });
```

- [ ] **Step 3: Implement.** Run checks. Commit `feat(posts): publish jobs, schedule rules, schedule, publish and repost routes`.

**Review focus:** Review Focus 1, 2 and 4; status and job always move in one transaction.

---

### Task L9: Publish worker, due sweep, retries, rate guard, notifications

**Files:**
- Create: `apps/web/src/lib/publish/handle-publish.ts` (+ test), `apps/web/src/lib/publish/rate-guard.ts` (+ test), `apps/web/src/app/api/jobs/publish-due/route.ts`
- Modify: `apps/web/src/lib/jobs.ts` (topic `publish`), `apps/web/src/instrumentation.ts` (dev interval calls `publishDue()`)

**Interfaces:**
- `publishDue(deps, now)`: runs `recoverStuck`, then `claimDue`, then `enqueue("publish", {jobId}, {dedupeId: "publish:<id>:<attempts>"})` for each claimed job.
- `handlePublish(deps: { linkedinFetch; store; email; jobs; clock; flag; redis }, jobId)`. The order matters:
  1. `startRun`. If it returns null → `ignored`.
  2. Flag off → `fail(publish_disabled)`, no HTTP.
  3. Load the connection. Missing, expired or `requiresReauth` → `fail(reconnect_required)` + email.
  4. Rate guard. When over the limit → `fail` with `retryAt = now + 2 min` (re-queued, attempts not consumed).
  5. Load the current version. Empty or too long → `fail(invalid_post)`.
  6. Upload media in order, reusing `linkedinAssetUrn` when the object is unchanged.
  7. `toLittleText`, then `createPost`.
  8. `succeed`, then send the `post-published` email.
  9. Errors are classified per design §6.4. A retry re-queues with `runAt = now + backoff`. A final failure sends the `post-failed` email.
- `rate-guard.ts`: an Upstash Redis sliding window (`@upstash/redis`; the fake is in memory). `allow(profileId, now)` permits ≤ 1 per minute
  and ≤ 25 per 24 h.

- [ ] **Step 1: Write the failing tests** (mock LinkedIn, local store, memory email, fake clock):

```ts
it("publishes text: one POST /rest/posts with author urn:li:person:<sub>, little-text commentary; document PUBLISHED with url", async () => { /* … */ });
it("duplicate delivery of the same job makes exactly one POST", async () => { await handlePublish(d, id); await handlePublish(d, id); expect(mock.calls.posts).toHaveLength(1); });
it("flag off → FAILED publish_disabled with zero LinkedIn calls", async () => { /* mock.calls.all.length === 0 */ });
it("500 after body → FAILED publish_unconfirmed, no retry, failed email sent", async () => { /* … */ });
it("network error before send → retried with backoff, succeeds on attempt 2", async () => { /* … */ });
it("429 Retry-After 120 → re-queued at now+120s", async () => { /* … */ });
it("401 → reconnect_required and connection.requiresReauth", async () => { /* … */ });
it("image post uploads first and caches the asset urn; a retry does not re-upload", async () => { /* … */ });
it("RUNNING for 11 minutes → recoverStuck marks publish_unconfirmed", async () => { /* … */ });
it("publish-due route: unsigned in qstash mode → 401; signed → claims and enqueues", async () => { /* … */ });
```

- [ ] **Step 2: Implement.** Run checks. Commit `feat(posts): publish worker, due sweep, retry policy and notifications`.
- [ ] **Gate:** the controller runs e2e with `E2E_LINKEDIN_FAKE=1` and `LINKEDIN_PUBLISH_ENABLED` unset: schedule → board Scheduled →
  unschedule; Publish shows "Publishing is off".

**Review focus:** Review Focus 1 and 2; logs contain job id and error code only.

---

### Task L10: `safeFetch`, link previews, mention resolution

**Files:**
- Create: `packages/knowledge/src/safe-fetch.ts` (+ test). Move the URL extractor's fetch onto it.
- Create: `apps/web/src/app/api/og-metadata/route.ts`, `apps/web/src/app/api/linkedin/resolve-mention/route.ts`, `apps/web/src/lib/og.ts` (+ test)

**Interfaces:**
- `safeFetch(url, { maxBytes, timeoutMs, accept: string[], lookup?: DnsLookup }): Promise<{ status; contentType; body: Buffer; finalUrl }>`
  (design §9).
- `parseOg(html, baseUrl): { title; description; image; url }`. The image URL is absolutised, https only.
- `resolveMention(profileId, url)`:
  - person → `{resolved:false, displayName: vanity}`
  - company → `lookupOrganization` with the profile's token
  - no connection → `resolved:false`
- Redis cache `og:<sha256(url)>` for 24 h.

- [ ] **Step 1: Tests.**
  - Refused: `http://169.254.169.254`, `http://[::1]`, `10.x`, a hostname resolving to `127.0.0.1` (fake lookup), a redirect to a private IP.
  - Bodies over 2 MB are cut.
  - A non-HTML type → 415.
  - OG parse fixtures.
  - The mention route rejects non-LinkedIn URLs (400) and returns `resolved:false` for `/in/` URLs.
- [ ] **Step 2: Implement.** Run checks.
- [ ] **Step 3: Live smoke.** One `GET /api/og-metadata?url=https://example.com` through the dev server owner (the controller), printing the title only.
- [ ] **Step 4: Commit.** `feat(posts): ssrf-safe fetch, link previews and mention resolution`.

**Review focus:** Review Focus 6; DNS pinning (connect to the checked IP).

---

### Task L11: Agent schedule proposal card and editor wiring

**Files:**
- Modify: `packages/agent/src/types.ts` (a `data-schedule-proposal` part `{documentId, scheduledAt, timezone, reason}`), `packages/agent/src/tools/documents.ts` or a new `tools/schedule.ts`:
  - a tool `proposeSchedule({ when: string /* ISO or "next free slot" */ })` that validates through `validateSchedule` + `nextFreeSlot` and
    writes the data part
  - it **returns text only** ("Proposed Tue 9:00. The user can confirm from the card.")
  - it never calls a route and never touches `PublishJob`
- Modify: `packages/agent/src/prompt.ts` (one line: scheduling and publishing happen only when the user clicks the card), `packages/agent/src/mock.ts`
- Create: `apps/web/src/components/chat/schedule-card.tsx` (minimal, Orbit primitives; the UI track restyles it), `apps/web/src/lib/posts-api.ts` additions (`schedulePost`, `unschedulePost`, `publishPost`, `publishStatus`)

- [ ] **Step 1: Tests.**
  - The tool writes exactly one data part and creates no `PublishJob` (DB count unchanged).
  - A past `when` → `Failed: …`.
  - The tool registry has no tool named `publish*` or `schedulePost` (registry test).
- [ ] **Step 2: Implement.** Run checks. Commit `feat(agent): schedule proposal card; publishing stays a user action`.

**Review focus:** Review Focus 2; the card's buttons send a fresh idempotency key per click.

---

### Task L12: Analytics access route and blocked ingestion stubs

**Files:**
- Create: `apps/web/src/app/api/analytics/access/route.ts` (+ test) returning `{connected, hasAnalyticsScope, needsReconnect, expiresAt, available:false, reason:"LinkedIn analytics access is pending approval."}`.
- Append to this plan's backlog section: BLOCKED tasks A1–A3 (metrics tables, sync job, dashboard routes) as in design §10. They have no code.

- [ ] Tests: the shape for not connected, connected, and needs reconnect. Commit `feat(analytics): access status route`.

---

### Task L13: End-to-end and close-out

- [ ] The controller runs every package test, typecheck, web lint and e2e (posts, editor schedule, chat schedule card) with mocks.
- [ ] Check that `.env.example` documents every new key, with comments. Grep that no file contains a real token pattern.
- [ ] Only if the user provides LinkedIn keys **and** says so: connect a test account → status → disconnect. **No publish.** Flag stays off.
- [ ] Update `docs/ROADMAP.md` §3 checkboxes. Commit `docs: feature 4 close-out`.

## Backlog (blocked or later)

- **A1–A3 analytics** (BLOCKED on Community Management API): `LinkedInPostMetric`, `LinkedInFollowerSnapshot`, `analytics.sync` (nightly + 48 h
  cache), `/api/analytics/{overview,followers,posts,post}`.
- First-comment automation (Social Actions API).
- Organisation posting.
- Video.
- Polls.
- Approval requests (the email template is reserved).
- Moving knowledge files to a private hosted bucket (after preflight D1).
