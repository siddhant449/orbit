# Feature 5: Visuals: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-brand AI images for posts, as in Kleo:
- suggest concepts in chat
- generate asynchronously and poll
- edit in plain words, with versions and revert
- logo compositing
- a brand theme with extraction from an image
- reference images
- a library
- credits: 30 per team per month, 1 per new image, 5 free edits per image

The OpenAI image provider is the default, behind `ImageProvider`. Gemini is an optional adapter, and a mock covers tests and dev.

**Architecture:** a new `@brandloop/visuals` package holds the provider, prompt builder, safety check, theme extraction and compositor. The
`@brandloop/db` services cover visuals, credits, theme and references. Jobs go through `@brandloop/jobs` (`visual.generate`, `visual.edit`,
`visual.logo`). Images are written to the public store of `@brandloop/storage` and references to the private store. The routes in `apps/web`
are thin, and there are three agent tools.

**Spec:** `docs/features/05-visuals/design.md`. Evidence: `docs/research/kleo-visuals.md`.

**Depends on Feature 4** (`docs/features/04-linkedin-posts/plan.md`):
- L1 storage
- L2 jobs
- L4 `PostMedia`, needed only for V6 attach. V1–V5 can start after L1 and L2.

The AI core and F4 Global Constraints apply.

## Global Constraints (additions)

- **Never a live image call in tests.** `VISUALS_PROVIDER=mock` is used in tests, e2e and dev by default. Exactly **one live smoke per provider**
  is allowed: V2 for OpenAI, and V9 for Gemini only if a key exists. Each is run once, by hand, on the smoke team. It prints the model id, ms and
  bytes, never the key, and deletes the stored object afterwards.
- **No chat tool spends credits.** Only a user click on `POST /api/visuals` debits (design §8, D4).
- **Credits move only inside a DB transaction** that row-locks `CreditAccount`. A visual has at most one `GENERATE` row and one `REFUND` row
  (unique key).
- **Private references never go to the public store.** Generated images, logos and carousel PDFs go to the public store, under unguessable keys.
- **Migrations come after Feature 4's:** V1 `visuals_credits_theme`, then V5 `reference_images`.
- **Copy:** our own wording throughout. The default theme uses Orbit's colours, not Kleo's hex values.

## Review Focus

1. **Credits are double-spent or lost.** Causes: parallel generates, a retried POST, a duplicate job delivery, a provider failure after the debit.
   The requirement: exactly one debit per visual, and exactly one refund on failure. Tests: V1, V3.
2. **A request that should be refused costs a credit or reaches the provider.** Examples: a real-person likeness, a deceptive screenshot, a third-party logo. Tests: V2, V3.
3. **Two operations run on one visual** (an edit during a generation, two edits from two tabs). The requirement: 409 `visual_in_progress`; the
   versions stay linear. Tests: V3, V4.
4. **An attached image drifts from the post.** After an edit or revert, a draft's `PostMedia` must point at the current version. A published
   post's media stays frozen. Tests: V6.
5. **Cross-profile or cross-team access** to visuals, themes, references or credits gives 404. Credits are team-wide by design. Tests: every route test.

## Order and gates

| # | Task | Migration | Live smoke | Gate after |
|---|---|---|---|---|
| V1 | Visuals, versions, credits, brand theme model + services | visuals_credits_theme | — | unit |
| V2 | `@brandloop/visuals`: ImageProvider (openai, mock), prompt builder, safety, crop | — | 1 OpenAI generation | unit |
| V3 | Generate job, routes (create, get, active, credits), polling contract | — | — | unit |
| V4 | Edit, versions, revert, logo compositing | — | — | unit |
| V5 | Brand theme routes + extraction, logo upload, reference images | reference_images | — | unit |
| V6 | Attach to post, library, alt text, delete | — | — | **controller: wire the editor branch, e2e (mock)** |
| V7 | Agent tools: suggestVisuals, proposeVisual, editVisual | — | — | controller: chat e2e (mock) |
| V8 | Cost guards, kill switch, close-out | — | — | **controller: full suite** |
| V9 | Gemini adapter (**only if `GOOGLE_GENERATIVE_AI_API_KEY` is provided**) + 10-prompt comparison | — | 1 Gemini generation | unit |

---

### Task V1: Model and services

**Files:**
- Modify: `packages/db/prisma/schema.prisma`: `Visual`, `VisualVersion`, `CreditAccount`, `CreditLedger`, `BrandTheme`, and the enums from design §4. Relations to `Profile`, `Team`, `Document` (SetNull) and `StorageObject`.
- Create: `packages/db/src/services/visuals.ts`, `credits.ts`, `brand-theme.ts`, each with a test
- Modify: `packages/db/src/index.ts` (export lines only)

**Interfaces:**
- **`credits.ts`:**
  - `getCredits(teamId, now): Promise<{ balance; monthlyAllocation; periodStartedAt; refillsAt }>` runs the lazy refill and creates the account
    on first read.
  - `refillIfDue(tx, account, now)` (internal)
  - `class OutOfCreditsError { balance; refillsAt }`
- **`visuals.ts`:**
  - `createVisualWithDebit(input: { profileId; teamId; userId; requestId; documentId?; type; aspect; userPrompt; customInstructions?; useBrandColours; referenceId? }, now): Promise<{ visual; balance; created: boolean }>`
    - One transaction: lock the account, refill, check, decrement, create the visual (PENDING, `activeOp:"generate"`), and write the ledger row
      GENERATE.
    - The same `(teamId, requestId)` → `created:false` and the existing visual, with no debit.
    - It throws `OutOfCreditsError`. An active generate for the same `documentId` gives `VisualError("in_progress")`.
  - `startOp(visualId, op): Promise<Visual | null>` is a compare-and-set from PENDING or COMPLETED with `activeOp` matching to PROCESSING.
  - `completeGenerate(visualId, { storageObjectId, width, height, provider, builtPrompt })` writes v0 and COMPLETED, and clears `activeOp`.
  - `failVisual(visualId, error, { refund: boolean })` sets FAILED and writes REFUND +1 in one transaction. A second call is a no-op.
  - `beginEdit(profileId, visualId)` checks the cap and the op lock and sets `activeOp:"edit"`.
  - `completeEdit(visualId, { storageObjectId, editPrompt, kind: "EDIT" | "LOGO", w, h })`: the version is `max + 1`, `currentVersion` follows,
    and `editCount += 1`.
  - `failEdit(visualId, error)` clears the op and keeps the current version. The visual stays COMPLETED with `error` set.
  - `revertVisual(profileId, visualId, version)` creates a REVERT version with the same object.
  - `getVisual(profileId, id)`, `getActiveForDocument(profileId, documentId)`, `listVisuals(profileId, { cursor, documentId? })`,
    `listVersions(profileId, id)`
  - `class VisualError { code: "not_found" | "in_progress" | "edit_limit" | "invalid" }`
- **`brand-theme.ts`:**
  - `getTheme(profileId)` returns the default Orbit palette when there is no row, with `decision NONE`.
  - `saveTheme(profileId, colours, source)` validates `#RRGGBB` and sets `decision CONFIRMED`.
  - `setDecision(profileId, accept, proposal?)`
  - `setLogo(profileId, objectId | null)`
  - `resetTheme(profileId)`

- [ ] **Step 1: Migrate.** Run `prisma migrate dev --name visuals_credits_theme` twice.
- [ ] **Step 2: Write the failing tests.**

```ts
it("debits once per requestId and returns the same visual on retry", async () => { /* balance 30 → 29, second call created:false, balance 29 */ });
it("20 parallel creates on balance 5: exactly 5 succeed, 15 OutOfCredits, ledger sum matches", async () => {
  await setBalance(team, 5);
  const r = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => createVisualWithDebit({ ...base, requestId: `r${i}` }, now)));
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(5);
  expect((await getCredits(team, now)).balance).toBe(0);
});
it("refills to the allocation after 30 days (no rollover) and advances by whole periods", async () => { /* 0 → 30 after 31 days; 95 days → periodStartedAt + 90d */ });
it("failVisual refunds exactly once even when called twice", async () => { /* … */ });
it("edit cap: the 6th edit throws edit_limit; revert stays allowed", async () => { /* … */ });
it("startOp is a CAS: a second concurrent start returns null", async () => { /* … */ });
it("another profile cannot read a visual; another team cannot see credits", async () => { /* … */ });
it("theme defaults to Orbit colours with decision NONE; saving sets CONFIRMED; bad hex refused", async () => { /* … */ });
```

- [ ] **Step 3: Implement.** Run the tests and checks. Commit `feat(db): visuals, versions, credits ledger and brand theme`.

**Review focus:** Review Focus 1; the row lock (`FOR UPDATE`) is taken before any balance read.

---

### Task V2: `@brandloop/visuals`: provider, prompt, safety, crop

**Files:**
- Create: `packages/visuals/{package.json,tsconfig.json,vitest.config.ts}`, `packages/visuals/src/{index.ts,provider.ts,openai.ts,mock.ts,prompt.ts,safety.ts,aspect.ts,errors.ts}` and tests, `packages/visuals/scripts/smoke-openai.ts`
- Modify: `apps/web/next.config.ts` (`transpilePackages`), `.env.example` (`VISUALS_ENABLED`, `VISUALS_PROVIDER`, `VISUALS_OPENAI_MODEL`, `VISUALS_QUALITY`, `VISUALS_TEAM_DAILY_LIMIT`, `VISUALS_GLOBAL_DAILY_LIMIT`, `GOOGLE_GENERATIVE_AI_API_KEY` (optional, commented))

**Interfaces:**
- `ImageProvider` and `createImageProvider` (design §7.1).
- `ProviderError { code: "refused" | "unavailable" | "verification_required" | "timeout" | "bad_output"; retryable: boolean }`
- `buildVisualPrompt(input): string` and `buildEditPrompt(rewritten: string): string` (design §7.3).
- `rewriteEditInstruction(ai: AiClient, instruction, context): Promise<string>` uses the `extract` model through `AiClient.json`, with a
  `.nullable()`-only schema.
- `checkVisualRequest(ai: AiClient | null, text): Promise<{ allowed: true } | { allowed: false; category; message }>` (design §7.5).
- `sizeFor(aspect)`, `cropToAspect(bytes, aspect): Promise<{ bytes; width; height }>`. It strips metadata and outputs PNG.
- `mockImageProvider({ delayMs?, fail?: ProviderError["code"] })`

- [ ] **Step 1: Check the SDK surface.**
  - Read `node_modules/ai/dist/index.d.ts` for `generateImage` (or `experimental_generateImage`) and check whether it accepts input images for
    OpenAI edits.
  - If it does, use it through `@ai-sdk/openai` `openai.image(model)`. If not, add the `openai` SDK (exact pin) and use `images.generate` and
    `images.edit`.
  - With the key, run `GET /v1/models` (a list call, no generation) and record which GPT Image models are available. Set the
    `VISUALS_OPENAI_MODEL` default to the newest one. Print model ids only.
- [ ] **Step 2: Write the failing tests.**

```ts
it("prompt: infographic template with theme hexes, safe-area line and post text fenced as data", () => { expect(buildVisualPrompt(fx)).toMatchSnapshot(); });
it("prompt: defuses tags in post text and omits colours when useBrandColours is false", () => { /* … */ });
it("safety: blocklist refuses without calling the model; classifier refusal maps category and copy", async () => { /* fake AiClient */ });
it("safety: classifier error falls back to blocklist-only (allowed for a neutral prompt) and logs", async () => { /* … */ });
it("cropToAspect: 1024x1536 → 1080x1350 for 4:5, no metadata", async () => { /* sharp metadata */ });
it("openai adapter maps 403 verification, 400 moderation, timeout and 5xx to ProviderError codes", async () => { /* fake fetch/SDK */ });
it("mock provider returns a valid PNG of the requested size after the delay", async () => { /* … */ });
```

- [ ] **Step 3: Implement.** Run the tests and checks.
- [ ] **Step 4: Live smoke (OpenAI, once, by hand).** `pnpm --filter @brandloop/visuals smoke:openai` makes one 1024×1024 `low` generation of "a
  flat illustration of a desk plant, no text". It prints the model id, ms and bytes, and writes nothing to storage. If verification is required,
  record that and stop; do not retry.
- [ ] **Step 5: Commit.** `feat(visuals): image provider (openai, mock), prompt builder, safety check, aspect crop`

**Review focus:** Review Focus 2; no key in logs or errors; the post text is framed as data.

---

### Task V3: Generate job and routes

**Files:**
- Create: `apps/web/src/lib/visuals/{deps.ts,handle-visual-job.ts}` (+ test), `apps/web/src/app/api/visuals/route.ts` (POST, GET list), `apps/web/src/app/api/visuals/[id]/route.ts` (GET, PATCH, DELETE), `apps/web/src/app/api/visuals/active/route.ts`, `apps/web/src/app/api/credits/route.ts`
- Modify: `apps/web/src/lib/jobs.ts` (topics `visual.generate`, `visual.edit`, `visual.logo`)

**Interfaces:**
- `POST /api/visuals` runs these steps in order:
  1. auth
  2. `VISUALS_ENABLED`
  3. zod
  4. post check: `source:"post"` needs a saved, non-deleted post of this profile (`post_required`)
  5. the theme decision: `useBrandColours && decision NONE` → 409 `needs_brand_confirmation {proposal: getTheme()}`
  6. `checkVisualRequest` → 422
  7. `createVisualWithDebit`
  8. `enqueue("visual.generate", {visualId}, {dedupeId: "visual:<id>:generate"})`
  9. 202
- `handleVisualJob({ provider, store, ai, clock }, { visualId, op })`:
  - `startOp` returns null → ignored.
  - generate: load the post text, theme and reference (private store bytes), build the prompt, `provider.generate` with a 150 s abort,
    `cropToAspect`, `storeFile(public, VISUAL)`, `completeGenerate`.
  - A `ProviderError` calls `failVisual(refund: true)` with user copy:
    - `refused`: "This image request was declined. Try a different description."
    - `verification_required` and `unavailable`: "Image generation is unavailable right now. Your credit was returned."
  - A `retryable` error on attempt < 3 throws `TransientJobError` and the job is retried. On the final attempt the visual is failed and the
    credit refunded.
- The `GET /api/visuals/:id` response is shaped as in design §5. `imageUrl` is the current version's public URL.

- [ ] **Step 1: Write the failing tests.**
  - Handler (mock provider, local store, local jobs):
    - success gives v0 and COMPLETED, and the credit stays debited
    - provider `refused` gives FAILED, a refund, and balance back to 30
    - timeout aborts the provider signal and refunds
    - a duplicate delivery after COMPLETED is ignored, with one version
    - a retryable error twice then success gives one debit and no refund
  - Routes:
    - 402 when the balance is 0
    - 409 brand confirmation, then accept, then re-POST gives 202
    - 422 for a real-person prompt, with balance unchanged and the provider not called
    - 409 `visual_in_progress` for a second generate on the same post
    - the same `requestId` gives the same id
    - another profile's visual gives 404
    - `GET /api/credits` refills lazily
- [ ] **Step 2: Implement.** Run checks. Commit `feat(visuals): async generation job, create/poll routes and credits`.

**Review focus:** Review Focus 1–3; the credit is refunded in the same transaction that marks FAILED.

---

### Task V4: Edit, versions, revert, logo

**Files:**
- Create: `apps/web/src/app/api/visuals/[id]/{edit,versions,revert,logo}/route.ts`
- Modify: `packages/visuals/src/` adds `composite.ts` (+ test), and `handle-visual-job.ts` gains the `edit` and `logo` ops

**Interfaces:**
- `compositeLogo(base, logo, { x, y, sizePercent })` (design §7.4).
- Edit route:
  1. `checkVisualRequest(instruction)`
  2. `beginEdit`
  3. `rewriteEditInstruction`, which runs inside the job (so the route is fast; the job stores the rewritten text as `editPrompt`)
  4. enqueue `visual.edit`
- Edit job:
  1. `provider.edit` with the current version's bytes
  2. crop to the visual's aspect
  3. store
  4. `completeEdit(kind EDIT)`
  5. on failure, `failEdit`. The free edit is not consumed: `editCount` increases only on completion.
- Logo route: needs `BrandTheme.logoObjectId` (409 `no_logo`), then `beginEdit` (a logo counts as an edit), then enqueue `visual.logo`. The logo
  job is local `sharp` work with no provider.

- [ ] **Step 1: Tests.**
  - An edit while generating returns 409.
  - Edit failure keeps the current version and leaves `editCount` unchanged.
  - The 5th edit is OK and the 6th returns 409 `edit_limit`.
  - Revert to v0 after two edits creates v3 = REVERT with v0's object, and its `imageUrl` equals v0's.
  - Logo at 92/92/8 on 1080×1350 puts the logo's bbox inside the image (pixel check on a red fixture logo).
  - Logo without a theme logo returns 409.
  - The versions list is ordered, and each entry has `kind` and `editPrompt`.
- [ ] **Step 2: Implement.** Run checks. Commit `feat(visuals): edit, version history, revert and logo compositing`.

**Review focus:** Review Focus 3; the edit counter only moves on success.

---

### Task V5: Brand theme, logo upload, reference images

**Files:**
- Modify: `schema.prisma` to add `ReferenceImage`. Migration `reference_images`.
- Create: `packages/db/src/services/reference-images.ts` (+ test), `packages/visuals/src/theme.ts` (`extractTheme`, + test with fixture images), the routes `apps/web/src/app/api/brand-theme/{route.ts,decision,extract,logo}/route.ts` and `apps/web/src/app/api/reference-images/{route.ts,[id]/route.ts,tags/route.ts}`

**Interfaces:**
- `extractTheme(bytes): Promise<Theme>` is deterministic, and its text roles meet AA contrast against the background.
- Logo upload:
  - accepts PNG, JPG or WebP, ≤ 2 MB, checked with `verifyUpload`
  - SVG is refused in v1 (script risk)
  - the image is trimmed, its longest side capped at 1,024 px, and stored in the **public** store (LOGO)
- References are stored in the **private** store (REFERENCE). They are served through `/api/files/:id` only, and their thumbnails are rendered
  through that route.

- [ ] **Step 1: Tests.**
  - `extractTheme` on three fixtures (light, dark, saturated) gives stable hex output and passes the contrast assertions.
  - The decision endpoint: accept saves the proposal as CONFIRMED, and skip sets SKIPPED; after either, POST `/api/visuals` no longer returns 409.
  - An SVG logo gives 415.
  - A reference upload writes to the private store (assert the store spy), and its title and tags are validated.
  - The tags endpoint returns distinct tags for this profile only.
  - Another profile's reference gives 404.
- [ ] **Step 2: Migrate** (twice). Implement and run checks. Commit `feat(visuals): brand theme, theme extraction, logo upload and reference images`.

**Review focus:** Review Focus 5; references never public.

---

### Task V6: Attach to post, library, alt text, delete

**Files:**
- Create: `apps/web/src/app/api/visuals/[id]/attach/route.ts`, `apps/web/src/lib/visuals-api.ts` (typed client + zod; this is what the editor and library branches wire to) and `visuals-api.test.ts`
- Modify: `packages/db/src/services/visuals.ts`: `completeEdit`/`revertVisual` update `PostMedia` rows of **non-published** posts that reference the visual, and clear `linkedinAssetUrn`. They use F4 L4 `post-media.ts`.

- [ ] **Step 1: Tests.**
  - Attach creates a `PostMedia` with the current object.
  - An edit after attach moves a draft's `PostMedia` to the new object.
  - A PUBLISHED post's media stays on the old object.
  - Detach.
  - Attaching a 21st image gives 422 (L4 rule).
  - The library lists newest first, with the post title, and paginates.
  - Delete soft-deletes and detaches from drafts only.
  - Alt text is capped at 1,000.
- [ ] **Step 2: Implement.** Run checks. Commit `feat(visuals): attach to posts, library, alt text and delete`.
- [ ] **Gate:** the controller wires the editor's "Add a visual" and image block, plus the `/images` library, to `visuals-api.ts`, then runs e2e
  with the mock provider: suggest (editor dialog) → generate → poll → image → edit → versions → revert → attach → reload persists.

**Review focus:** Review Focus 4.

---

### Task V7: Agent tools

**Files:**
- Create: `packages/agent/src/tools/visuals.ts` (+ test)
- Modify: `packages/agent/src/tools/index.ts` (adds the group only when `ctx.visualsEnabled`), `packages/agent/src/context.ts` (`visualsEnabled`, `visuals` deps), `packages/agent/src/types.ts` (data parts `data-visual-concepts`, `data-visual-proposal`, `data-visual-status`), `packages/agent/src/client/labels.ts`, `packages/agent/src/mock.ts`, `packages/agent/src/prompt.ts` (two lines: concepts first; generation is the user's click; edits are free up to five), `apps/web/src/lib/chat-deps.ts`
- Create: `apps/web/src/components/chat/visual-cards.tsx` (minimal concept, proposal and status cards using Orbit primitives; the UI track restyles them)
- Add quick link `suggest-images` (already in the AI core catalogue as unavailable) and mark it available.

**Interfaces:**
- `suggestVisuals({ focusHint: string | null })` returns `{concepts}` (≤ 3; types infographic, before/after, quote or general). It uses the
  `extract` model and costs no credit. It requires the chat's post; otherwise it returns `Failed: save a post first…`.
- `proposeVisual({ prompt: string; type; aspect: VisualAspect | null })` writes the card and returns text. **It never debits.**
- `editVisual({ instruction: string })` targets the latest COMPLETED visual attached to the chat's post. It calls the same service and enqueue path
  as the edit route, and returns `{status:"editing", visualId, remainingEdits}` or `Failed: …`.

- [ ] **Step 1: Tests.**
  - `suggestVisuals` gives one data part and 3 concepts.
  - `proposeVisual` leaves the ledger row count unchanged and writes one card.
  - `editVisual` increments `editCount` after the job (local driver) and reaches `edit_limit` → `Failed:`.
  - The registry test confirms no tool named `generate*` exists.
  - A scripted turn "suggest images" → `suggestVisuals` → one short text line.
- [ ] **Step 2: Implement.** Run checks. Commit `feat(agent): visual concepts, proposal cards and in-chat image edits`.
- [ ] **Gate:** the controller runs a chat e2e (mock): "Suggest some images for this post" → cards → Generate → image in panel.

---

### Task V8: Cost guards, kill switch, close-out

**Files:**
- Create: `apps/web/src/lib/visuals/limits.ts` (+ test). It counts per-team daily operations and global daily operations with Upstash Redis
  (in-memory fake in tests), and allows at most 2 concurrent active operations per team (DB count of `activeOp`).
- Modify: the create, edit and logo routes to call `checkVisualLimits` before any debit or enqueue. The responses are 429 `daily_limit` and
  503 `visuals_paused`.

- [ ] **Step 1: Tests.**
  - The 41st operation of the day gives 429, and the balance is unchanged.
  - The global limit gives 503.
  - A third concurrent operation gives 429 `too_many_active`.
  - Counters reset at UTC midnight (fake clock).
- [ ] **Step 2: Implement.** Run all checks.
- [ ] **Step 3: Close-out.**
  - Update `.env.example` and ROADMAP §6.
  - The controller runs the full suite.
  - Commit `feat(visuals): cost guards and kill switch; docs close-out`.

---

### Task V9 (conditional): Gemini adapter and comparison

Run this task only if the user provides `GOOGLE_GENERATIVE_AI_API_KEY`.

**Files:** `packages/visuals/src/gemini.ts` (+ test with a fake), `packages/visuals/scripts/{smoke-gemini.ts,compare.ts}`.

- [ ] Step 1: Read the `@ai-sdk/google` `.d.ts` for an image-output Gemini model and for input images. Pin an exact version per the release-age
  policy.
- [ ] Step 2: The adapter maps errors to `ProviderError`. Tests use a fake.
- [ ] Step 3: Live smoke: one generation, by hand. It prints the model id, ms and bytes.
- [ ] Step 4: `compare.ts` runs 10 fixed infographic prompts on both providers and writes the images to the scratchpad only. **This needs the
  user's go-ahead, because it costs ~20 generations.** The user picks the default provider.
- [ ] Step 5: Commit `feat(visuals): optional gemini image provider`.
