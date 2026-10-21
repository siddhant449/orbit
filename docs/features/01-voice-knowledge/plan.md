# Feature 1: Voice, memories, strategy and knowledge base — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each profile four stores the AI can write from: memories, a writing voice, a content strategy and a knowledge base. Each store gets screens to view and edit it, and there is a first-run setup that fills them.

**Architecture:**
- **Data:** a profile-scoped service layer in `packages/db/src/services/*`.
- **AI:** calls go through `packages/ai`, which has an injectable Claude client, zod schemas and a guard that rejects refusals.
- **Background work:** slow work (imports, ingestion, generation) is a `BackgroundJob` row executed through Next's `after()`.
- **Transcription:** a `Transcriber` chain, Deepgram first, then YouTube captions.
- **Screens:** built in `apps/web` inside the existing shell, with frontend-design.

**Tech stack:**
- Next.js 16.4, Prisma 7.10.1 (Postgres), Vitest 5, Playwright
- `@anthropic-ai/sdk`, zod
- Extraction libraries: `unpdf`, `mammoth`, `xlsx`, `@mozilla/readability` with `linkedom`
- `youtube-transcript`
- Deepgram REST API

**Spec:** `docs/features/01-voice-knowledge/design.md` (approved 2026-10-21). Reference: `recon.md` in the same folder.

## Global constraints

- **Profile scope:** every query is scoped to a profile the caller can see. Reuse `findVisibleProfile` logic from `packages/db/src/services/account.ts` by exporting it as `assertProfileAccess(userId, profileId)`.
- **Preset voices:** invented names only. No real creator's name or photo, and no copied posts. Avatars are generated (initials on a colour).
- **Knowledge limits:**
  - Title: at most 100 characters
  - Text content: at most 50,000 characters
  - Text item minimum: 100 words
  - Documents: PDF, DOCX, XLSX, TXT, MD, up to 20 MB
  - Images: JPG, PNG, WebP, GIF, up to 10 MB
  - List page size: 50
- **Transcription order:**
  1. Deepgram (`DEEPGRAM_API_KEY`, model `nova-3`)
  2. YouTube captions
  3. Otherwise the item fails with a reason
- **Exact copy for the unavailable state:** "Video transcription is unavailable right now (Deepgram). YouTube links still work using captions."
- **Model IDs:** load the `claude-api` skill before writing `packages/ai`, and use the current Claude 5 IDs. Defaults: `claude-sonnet-5-5` for generation, `claude-haiku-5-5` for extraction and summaries. Both can be overridden with `AI_MODEL_GENERATE` and `AI_MODEL_EXTRACT`.
- **AI keys:** no AI call ever runs in unit tests. Every AI function takes the client as a parameter, and tests pass a fake.
- **Interface copy:** sentence case, no all-caps labels, buttons named for what they do.

## Review focus

1. **The model returns a refusal or a clarifying question instead of facts.** Nothing should be stored, and the job should be marked failed with "Couldn't find facts to save". This is the Kleo defect. Covered by a test in Task 3.
2. **A URL that can't be fetched or has no readable text** (404, a paywall, or a PDF link). The item should become `failed` with a readable error, not stay stuck in "processing". Test in Task 7.
3. **Content-mix percentages that don't sum to 100**, whether from the model or a manual edit. Normalise to exactly 100 when saving. Test in Task 5.
4. **Deepgram returns 402 or 401, or the key isn't set.** Fall back to captions for YouTube links. For anything else, fail with the unavailable message, and the status endpoint reports `deepgram: "unavailable"`. Test in Task 8.
5. **A user edits one memory line in a document with nested bullets.** Only that line changes; indentation and other lines stay byte-identical. Test in Task 1.

---

### Task 1: Data models and memory service

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/services/account.ts` (export `assertProfileAccess`)
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/services/memory.ts`
- Test: `packages/db/src/services/memory.test.ts`

**Interfaces:**
- Produces these Prisma models, with fields exactly as in the design:
  - `MemoryDoc` (unique on `[profileId, key]`; `source` is an enum `MemorySource { USER EXTRACTED IMPORTED MIRRORED }`)
  - `Strategy`
  - `VoiceStyle` (enum `VoiceKind { PRESET OWN URL }`)
  - `KnowledgeItem` (enums `KnowledgeType { TEXT DOCUMENT URL VIDEO IMAGE }` and `KnowledgeStatus { PROCESSING READY FAILED }`)
  - `BackgroundJob` (enums `JobKind { MEMORY_IMPORT KNOWLEDGE_INGEST STRATEGY_GENERATE VOICE_EXTRACT }` and `JobStatus { QUEUED RUNNING DONE FAILED }`)
  - `Profile.voiceStyleId`, optional
- Produces from `account.ts`: `assertProfileAccess(userId: string, profileId: string): Promise<Profile>`, which throws `AccountError("Profile not found")`.
- Produces from `memory.ts`:
  - `MEMORY_KEYS = { about: "identity/about", story: "identity/story", personal: "identity/personal", rules: "writing/rules", voice: "voice/style" } as const`
  - `listMemory(profileId): Promise<MemoryDoc[]>`, ordered by key
  - `upsertMemory(profileId, key, content, source): Promise<MemoryDoc>`. Keys must match `/^[a-z0-9-]+(\/[a-z0-9-]+)*$/`.
  - `appendMemoryLines(profileId, key, lines: string[], source)`. Appends `- line` bullets and skips any line already present (ignoring case and whitespace).
  - `editMemoryLine(profileId, key, lineIndex: number, text: string)`
  - `deleteMemoryLine(profileId, key, lineIndex: number)`
  - `memoryLines(content): { index: number; text: string; depth: number }[]`. Bullet lines only; `index` is the raw line index.

- [ ] **Step 1: Add the models, export `assertProfileAccess`, and run `prisma migrate dev --name feature1`**
  - Expected: the migration is created and the client regenerated.
- [ ] **Step 2: Write the failing tests in `memory.test.ts`**
  - `upsertMemory` rejects the key `"Bad Key"`.
  - `appendMemoryLines(p, "identity/personal", ["Runs a design studio", "runs a design studio "])` stores one bullet.
  - **Review focus 5:** given content `"- a\n  - a1\n- b"`:
    - `editMemoryLine(…, 1, "A1!")` produces `"- a\n  - A1!\n- b"`
    - `deleteMemoryLine(…, 2)` then produces `"- a\n  - A1!"`
  - Editing a profile the user can't see throws `/not found/` when the caller goes through `assertProfileAccess`.
- [ ] **Step 3: Run `pnpm --filter @brandloop/db test`**
  - Expected: the new tests fail because `memory.ts` doesn't exist yet.
- [ ] **Step 4: Implement `memory.ts`**
  - Line edits keep the original indent and bullet marker, and replace only the text after the marker.
- [ ] **Step 5: Run the tests**
  - Expected: all of them pass, including the existing 8.
- [ ] **Step 6: Commit** with the message `feat(db): feature 1 models and memory service`

### Task 2: `packages/ai`: the Claude client, schemas and refusal guard

**Files:**
- Create: `packages/ai/package.json` (name `@brandloop/ai`; dependencies `@anthropic-ai/sdk`, `zod`), `tsconfig.json`
- Create: `packages/ai/src/client.ts`, `src/schemas.ts`, `src/guard.ts`, `src/index.ts`
- Test: `packages/ai/src/guard.test.ts`, `src/schemas.test.ts`

**Interfaces:**
- `client.ts`:
  - `type AiClient = { json<T>(opts: { model: "generate" | "extract"; system: string; prompt: string; schema: z.ZodType<T>; images?: { mediaType: string; base64: string }[] }): Promise<T>; text(opts: {...same without schema}): Promise<string> }`
  - `createClaudeClient(apiKey = process.env.ANTHROPIC_API_KEY): AiClient`. It uses the structured-output or tool-use approach recommended by the claude-api skill. It throws `AiUnavailableError` when the key is missing.
- `schemas.ts`:
  - `GoalSchema = z.enum(["get_customers","build_authority","grow_audience"])`
  - `ContentTypeSchema = z.enum(["lead_magnet","personal","authority","sales","educational"])`
  - `AudienceLevelSchema = z.enum(["broad","narrow","niche"])`
  - `FormatSchema = z.enum(["text","image","carousel","video","newsletter","poll"])`
  - `StrategySchema = z.object({ goal, goalWhy, positioning, positioningWhy, tagline, expertise, expertiseWhy, contentMix: z.array({type, percent}), audienceBalance: z.array({level, percent, note}), contentFormats: z.array({format, perWeek: z.number(), note}), recurringSeries: z.array({name, weekday: z.enum(["mon",…,"sun"]), description}) })`
  - `ExtractedMemorySchema = z.object({ facts: z.array(z.object({ key: z.string(), text: z.string() })), refusal: z.boolean() })`
  - `VoiceGuideSchema = z.object({ guide: z.string(), tagline: z.string() })`
  - Label tables copied exactly from `recon.md`: `GOALS`, `CONTENT_TYPES` (label, description, examples), `AUDIENCE_LEVELS`, `FORMATS`.
  - `normalizePercents<T extends {percent:number}>(items: T[]): T[]`. Rounds the values and fixes the largest so the total is exactly 100. An empty list returns an empty list.
- `guard.ts`:
  - `looksLikeRefusal(text: string): boolean`. True for model meta-replies: phrases such as "I appreciate you", "I notice the input", "Could you provide", "I would need", "As an AI", "I can't help", and text ending in a question addressed to the user.

- [ ] **Step 1: Write the failing tests**
  - `looksLikeRefusal` returns true for the three refusal strings quoted in `recon.md` (Identity section).
  - It returns false for "Left an agency last year to go solo." and for "Runs a 6-person design studio in Pune."
  - `normalizePercents([{percent:33.3},{percent:33.3},{percent:33.3}])` sums to 100.
  - `normalizePercents([{percent:50},{percent:70}])` sums to 100 and keeps the ratio within ±1.
  - `StrategySchema.parse` rejects `goal: "fame"`.
- [ ] **Step 2: Run `pnpm --filter @brandloop/ai test`**
  - Expected: FAIL.
- [ ] **Step 3: Load the `claude-api` skill, then implement the client, schemas and guard**
- [ ] **Step 4: Run the tests**
  - Expected: PASS. Then add `@brandloop/ai` to `apps/web` and to `transpilePackages`.
- [ ] **Step 5: Commit** with the message `feat(ai): claude client, strategy/memory schemas, refusal guard`

### Task 3: Background jobs and memory import

**Files:**
- Create: `packages/db/src/services/jobs.ts`, `packages/db/src/services/memory-import.ts`
- Create: `apps/web/src/app/api/memories/import/route.ts`
- Create: `apps/web/src/app/api/jobs/[id]/route.ts`
- Create: `apps/web/src/lib/run-job.ts`
- Test: `packages/db/src/services/memory-import.test.ts`

**Interfaces:**
- `jobs.ts`:
  - `createJob(profileId, kind, input: unknown): Promise<BackgroundJob>`
  - `runJob(jobId, fn: () => Promise<unknown>)`. Sets `RUNNING`, then either `DONE` with the result in `output`, or `FAILED` with `error = err.message`.
  - `getJob(profileId, jobId)`
- `memory-import.ts`:
  - `importMemories(ai: AiClient, profileId: string, text: string): Promise<{ saved: number }>`
  - Calls `ai.json({model:"extract", schema: ExtractedMemorySchema, …})`. The prompt asks for first-person facts sorted into the keys `identity/about`, `identity/personal`, `identity/story`, `writing/rules` and `topics/<slug>`.
  - Drops every fact where `looksLikeRefusal(text)` is true or `text` is shorter than 8 characters.
  - If `refusal` is true or no facts survive, throws `Error("Couldn't find facts to save")`.
  - Otherwise calls `appendMemoryLines` per key with source `IMPORTED`.
- `run-job.ts`: `startJob(kind, profileId, input, work: (ai) => Promise<unknown>): Promise<{ jobId }>`. Creates the job, then `after(() => runJob(...))`.
- `POST /api/memories/import`:
  - body `{ text: string }` (1 to 50,000 characters)
  - responds 202 `{ jobId }`
  - responds 400 `{ error: "Paste something to import" }` when the text is empty
- `GET /api/jobs/:id` returns `{ status, error }`.

- [ ] **Step 1: Write the failing tests, using a fake `AiClient`**
  - The fake returns facts `[{key:"identity/personal",text:"Runs a design studio"}]`, so `saved` is 1 and the memory document contains `- Runs a design studio`.
  - **Review focus 1:** the fake returns facts whose text is "I appreciate you testing my system, but I notice the input contains only random characters…". This throws "Couldn't find facts to save" and no document is created.
  - The fake returns `refusal: true`, which throws the same error.
- [ ] **Step 2: Run the tests**
  - Expected: FAIL.
- [ ] **Step 3: Implement `jobs.ts`, `memory-import.ts`, `run-job.ts` and the two routes**
  - Routes call `getAccount()` and use `currentProfile`.
- [ ] **Step 4: Run the tests and `pnpm --filter @brandloop/web typecheck`**
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: background jobs and memory import`

### Task 4: Memories screen

**Files:**
- Modify: `apps/web/src/app/(app)/settings/memories/page.tsx`, which replaces the `Upcoming` placeholder
- Create: `apps/web/src/components/memories/memory-card.tsx`, `import-dialog.tsx`, `add-memory.tsx`
- Modify: `apps/web/src/app/(app)/actions.ts` to add `editMemoryLineAction`, `deleteMemoryLineAction` and `addMemoryAction(key, text)`

**Interfaces:**
- Consumes `listMemory`, `memoryLines`, `editMemoryLine`, `deleteMemoryLine` and `appendMemoryLines` from Task 1, and the import route from Task 3.
- **Cards**, in this order:
  - **Identity:** the `identity/*` keys. "Background and details we use to ground your posts."
  - **Writing preferences:** `writing/rules`. "Your rules for how your posts are written."
  - **Voice:** `voice/style`
  - **Topics you know:** `topics/*`, one sub-card per slug
  - **Strategy notes:** `strategy/*`
- **Each card:** shows "Updated {date}". Each bullet row is click-to-edit inline (Enter saves, Escape cancels) and has a delete icon that asks for confirmation.
- **Import dialog:**
  - A collapsible "How to get your memories" section. It holds the copyable prompt (our own wording): "I'm moving to a new writing assistant. List everything you know about me — background, work, interests, opinions, audience and how I like to write — as plain-text bullet points."
  - A textarea, a Cancel button and an "Import memories" button.
  - On submit, show the toast "Importing your memories. They'll appear here in a moment." Then poll `/api/jobs/:id` every 2 seconds.
    - On `DONE`, refresh the page and toast "Memories imported".
    - On `FAILED`, toast the error.

- [ ] **Step 1: Invoke `/frontend-design:frontend-design` and build the screen to the spec above**
- [ ] **Step 2: Run `pnpm --filter @brandloop/web lint typecheck`**
  - Expected: no errors.
- [ ] **Step 3: Check in Chrome at localhost**
  - Add a memory, edit it, and delete it. The dev server must be running and the user signed in.
- [ ] **Step 4: Commit** with the message `feat(web): memories screen`

### Task 5: Strategy

**Files:**
- Create: `packages/db/src/services/strategy.ts`, `packages/db/src/services/strategy.test.ts`
- Create: `apps/web/src/app/(app)/strategy/page.tsx`
- Create: `apps/web/src/components/strategy/*`: `foundation.tsx`, `content-mix.tsx` (donut and legend), `audience-balance.tsx`, `formats-cadence.tsx`, `series.tsx`, `generate-button.tsx`
- Create: `apps/web/src/app/api/strategy/generate/route.ts`
- Modify: `apps/web/src/lib/nav.ts`: add "Strategy" (`/strategy`, icon `Compass`) at the top of the Ideas section's Discover group, and add `/strategy` to `matches`

**Interfaces:**
- `strategy.ts`:
  - `getStrategy(profileId): Promise<Strategy | null>`
  - `saveStrategy(profileId, data: z.infer<typeof StrategySchema>): Promise<Strategy>`. Validates the data, runs `normalizePercents` on `contentMix` and `audienceBalance`, and mirrors the positioning, tagline and pillars into memory `strategy/themes` with source `MIRRORED`.
  - `generateStrategy(ai, profileId): Promise<Strategy>`. Builds the prompt from `listMemory` and the 20 most recent `READY` knowledge titles and summaries, then calls `ai.json({model:"generate", schema: StrategySchema})` and saves the result.
- `POST /api/strategy/generate` returns 202 `{jobId}` (kind `STRATEGY_GENERATE`).
- **Page states:**
  - **Empty:** "No strategy yet", with the button "Generate my strategy".
  - **Missing data:** if `identity/*` is empty, the helper text reads "Add your identity in Memories first for a sharper strategy."
  - **Filled:** the five sections in the design's order. Each field edits inline, and changes save through `saveStrategyAction`.

- [ ] **Step 1: Write the failing tests**
  - **Review focus 3:** `saveStrategy` with contentMix percents `[40,40,40]` stores them summing to 100.
  - `saveStrategy` writes memory `strategy/themes` containing the positioning text.
  - `generateStrategy` with a fake AI stores the fake's goal.
- [ ] **Step 2: Run the tests**
  - Expected: FAIL.
- [ ] **Step 3: Implement the service and the route**
- [ ] **Step 4: Run the tests**
  - Expected: PASS.
- [ ] **Step 5: Invoke `/frontend-design:frontend-design` and build the page and its components**
  - The donut is SVG built from the jade-family palette tokens, with segment hover that highlights the matching legend row.
  - Run `lint typecheck`.
- [ ] **Step 6: Commit** with the message `feat: content strategy`

### Task 6: Writing styles (voice)

**Files:**
- Create: `packages/db/prisma/presets.ts`: 9 preset voices, with invented names, taglines and markdown style guides
- Modify: `packages/db/prisma/seed.ts`, which upserts the presets
- Create: `packages/db/src/services/voice.ts`, `voice.test.ts`
- Create: `apps/web/src/components/home/voice-picker.tsx`
- Modify: `apps/web/src/components/home/composer.tsx`, replacing the disabled button with the picker
- Create: `apps/web/src/app/api/voice/own/route.ts`

**Interfaces:**
- `presets.ts`: `PRESET_VOICES: { slug, name, tagline, guide }[]`. There are 9, one per creator kind in the design's list. Each guide has the sections `## Rhythm`, `## Structure`, `## Signature moves` and `## Avoid`.
- `voice.ts`:
  - `listVoices(profileId)`: presets plus the profile's own style
  - `selectVoice(userId, profileId, voiceStyleId)`
  - `getSelectedVoice(profileId)`. Falls back to the profile's own style, otherwise null.
  - `createOwnVoice(ai, profileId, posts: string[])`. Requires 3 to 10 posts, each at least 200 characters; otherwise throws `Error("Paste at least 3 posts of 200+ characters")`. It calls `ai.json({model:"extract", schema: VoiceGuideSchema})`, upserts an `OWN` voice named after the profile, and mirrors the guide into memory `voice/style`.
- **Picker:**
  - "Selected writing style" (the current style with avatar and tagline)
  - "Change writing style", which opens a searchable list: own style first, then "Add your style", then presets
  - "Add your style" opens a dialog with a textarea where posts are separated by a line containing `---`

- [ ] **Step 1: Write the failing tests**
  - Seeding twice leaves exactly 9 presets.
  - `createOwnVoice` with 2 posts throws the exact message.
  - With 3 valid posts and a fake AI, it creates an `OWN` voice and writes `voice/style`.
  - `selectVoice` with a preset id sets `Profile.voiceStyleId`.
- [ ] **Step 2: Run the tests**
  - Expected: FAIL.
- [ ] **Step 3: Implement the presets, seed and service**
- [ ] **Step 4: Run the tests**
  - Expected: PASS.
- [ ] **Step 5: Invoke frontend-design, build the picker and the add-style dialog, and run `lint typecheck`**
- [ ] **Step 6: Commit** with the message `feat: writing styles`

### Task 7: Knowledge ingestion (everything except video)

**Files:**
- Create: `packages/knowledge/` (`@brandloop/knowledge`), containing:
  - `src/upload-store.ts`
  - `src/extract/{pdf,docx,xlsx,plain,url,image}.ts`
  - `src/limits.ts`
  - `src/ingest.ts`
- Test: `packages/knowledge/src/*.test.ts`, with fixtures in `packages/knowledge/test/fixtures/` (`sample.pdf`, `sample.docx`, `sample.xlsx`, `sample.md`, `article.html`)
- Create: `packages/db/src/services/knowledge.ts`, `knowledge.test.ts`
- Create the routes:
  - `apps/web/src/app/api/knowledge-base/route.ts` (GET list, POST create)
  - `[id]/route.ts` (GET, PATCH title/content, DELETE)
  - `apps/web/src/app/api/upload/route.ts`

**Interfaces:**
- `limits.ts`:
  - `KNOWLEDGE_LIMITS = { title: 100, text: 50000, minWords: 100, documentBytes: 20*1024*1024, imageBytes: 10*1024*1024, pageSize: 50 }`
  - `DOCUMENT_TYPES` and `IMAGE_TYPES` (MIME types and extensions from the global constraints)
- `UploadStore`:
  - `put(buf: Buffer, mime: string): Promise<string /*key*/>`, `get(key): Promise<Buffer>`, `delete(key)`
  - `localUploadStore(root = ".data/uploads")`
- `extractText(input: { kind: "document"; buf: Buffer; mime: string } | { kind: "url"; url: string } | { kind: "image"; buf: Buffer; mime: string }, deps: { ai: AiClient; fetch?: typeof fetch }): Promise<string>`
  - URL: rejects non-http(s) URLs and private-network hosts (localhost, 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16).
  - Times out after 15 seconds.
  - Throws `IngestError("Couldn't read that page")` when the readable text is under 200 characters.
- `knowledge.ts`:
  - `listKnowledge(profileId, { type?, q?, order: "asc"|"desc", offset })`. `q` is ignored when shorter than 3 characters. Returns `{ items, hasMore }`.
  - `createKnowledge(profileId, input)`. Returns the item in `PROCESSING` (`TEXT` items go straight to `READY`).
  - `completeIngest(id, text, summary)` and `failIngest(id, message)`
  - `updateKnowledge` and `deleteKnowledge`, which also deletes the stored file
- `ingest.ts`: `ingestKnowledge(deps, itemId)`. Extracts the text, writes a summary with `ai.text({model:"extract"})`, then calls `completeIngest`. Any thrown error calls `failIngest` with `err.message`.

- [ ] **Step 1: Write the failing tests**
  - Each fixture extracts to text containing its known sentence.
  - A text item with 99 words is rejected with the message "Add at least 100 words".
  - A 101-character title is rejected.
  - **Review focus 2:** a URL whose fake fetch returns 404 makes the item `FAILED` with "Couldn't read that page".
  - `http://127.0.0.1/x` is rejected.
  - `listKnowledge` returns 50 items with `hasMore: true` when 51 exist.
- [ ] **Step 2: Run the tests**
  - Expected: FAIL.
- [ ] **Step 3: Implement the package and service. Upload and create routes start an ingest job (`KNOWLEDGE_INGEST`).**
- [ ] **Step 4: Run the tests**
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: knowledge ingestion`

### Task 8: Transcription chain (Deepgram, then YouTube captions)

**Files:**
- Create: `packages/knowledge/src/transcribe/{deepgram,youtube,chain}.ts` and `chain.test.ts`
- Create: `apps/web/src/app/api/status/transcription/route.ts`
- Modify: `packages/knowledge/src/ingest.ts`, adding the VIDEO branch

**Interfaces:**
- `type Transcriber = { name: "deepgram" | "youtube-captions"; canHandle(src: VideoSource): boolean; transcribe(src: VideoSource): Promise<string> }`
- `type VideoSource = { kind: "url"; url: string } | { kind: "file"; key: string; mime: string }`
- `deepgramTranscriber(apiKey?, fetch?, enabled = process.env.DEEPGRAM_ENABLED === "true")`:
  - When `enabled` is false it never calls the network and throws `ProviderUnavailableError("disabled")`. The user's key has limited credits, so it stays off by default.
  - Calls `POST https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true` with the header `Authorization: Token <key>`.
  - For URLs it sends a JSON body `{url}`; for files it sends the raw bytes.
  - It throws `ProviderUnavailableError` when the key is missing or the response status is 401, 402, 403 or 429, or any 5xx.
- `youtubeCaptions()`: handles youtube.com and youtu.be URLs only.
- `transcribeVideo(src, chain): Promise<{ text: string; provider: string }>`:
  - Tries each provider in order and skips a provider when it throws `ProviderUnavailableError`.
  - When all providers are unavailable, throws `IngestError(TRANSCRIPTION_UNAVAILABLE)`, where `TRANSCRIPTION_UNAVAILABLE` is the exact copy from the global constraints.
- `getTranscriptionStatus(): Promise<{ deepgram: "ok" | "unavailable" | "not_configured" | "disabled"; youtubeCaptions: "ok" }>`. Returns `"disabled"` without making any network call when `DEEPGRAM_ENABLED !== "true"`. Otherwise it checks with `GET /v1/projects` and caches the result for 5 minutes.
- `GET /api/status/transcription` returns that object.

- [ ] **Step 1: Write the failing tests, using a fake fetch**
  - **Review focus 4:** Deepgram returns 402 for a YouTube URL. The result uses `provider: "youtube-captions"` (with a faked captions fetcher).
  - A missing key and a TikTok URL throw the exact unavailable message.
  - With `enabled=false`, the fake fetch is never called, and a YouTube URL is still transcribed from captions.
  - Deepgram returns 200 with `results.channels[0].alternatives[0].transcript = "hello world"`, giving the text "hello world".
- [ ] **Step 2: Run the tests**
  - Expected: FAIL.
- [ ] **Step 3: Implement the chain and status, and add `DEEPGRAM_API_KEY=` to `.env.example`**
- [ ] **Step 4: Run the tests**
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: video transcription with deepgram and caption fallback`

### Task 9: Knowledge base screen

**Files:**
- Modify: `apps/web/src/app/(app)/knowledge-base/page.tsx`
- Create: `apps/web/src/components/knowledge/{toolbar,item-card,add-dialog,item-drawer}.tsx`
- Modify: `apps/web/src/lib/nav.ts`: add "Knowledge base" (`/knowledge-base`, icon `Library`) to the Ideas section's My library group

**Interfaces:**
- Consumes the Task 7 routes and `/api/status/transcription` from Task 8.
- **Toolbar:**
  - search box, "Search by title (3+ characters)", debounced 300 ms
  - type filter: All, Text, Documents, Links, Video, Images
  - sort: Newest, Oldest
  - "Add knowledge" button
- **List:** infinite scroll at 50 items per page. Each card shows a type badge, a status chip (Processing, or Failed with the error in a tooltip), and a "⋮" menu with Edit title, Use in a post (disabled until Feature 2) and Delete. Kleo's duplicated menu items are not reproduced.
- **Add dialog tabs:** Text, Document, Link, Video, Image, with the limits from `KNOWLEDGE_LIMITS` and live character counts.
  - The Video tab offers "Link" or "Upload file".
  - When `deepgram !== "ok"`, the Video tab shows the unavailable notice, using the exact copy.
- **Drawer:** read and edit the title and content, and delete.

- [ ] **Step 1: Invoke `/frontend-design:frontend-design` and build to the spec**
- [ ] **Step 2: Run `lint typecheck`**
- [ ] **Step 3: Chrome check**
  - Add a text item; it shows READY.
  - Add a link item; it shows Processing, then READY.
  - Search, filter and delete work.
- [ ] **Step 4: Commit** with the message `feat(web): knowledge base screen`

### Task 10: First-run setup

**Files:**
- Create: `apps/web/src/app/(setup)/setup/page.tsx` (outside the shell) and `apps/web/src/components/setup/*`
- Modify: `apps/web/src/app/(app)/layout.tsx`: redirect to `/setup` when `currentProfile.onboardingCompleted === false`
- Create: `packages/db/src/services/setup.ts` and `setup.test.ts`

**Interfaces:**
- `completeSetup(ai, userId, profileId, input: { role: string; knownFor: string; audience: string; posts: string[]; goal: Goal })`:
  - writes `identity/personal` bullets from role, knownFor and audience (source `USER`)
  - calls `createOwnVoice` when 3 or more posts are given
  - saves a strategy seeded with the goal through `generateStrategy`
  - sets `onboardingCompleted = true`
- `skipSetup(userId, profileId)` sets `onboardingCompleted = true` without making any AI calls.
- **The four steps:**
  1. "What do you do?" (role and what you're known for)
  2. "Who do you write for?" (audience)
  3. "Paste a few of your posts" (optional, with "Skip this step")
  4. "What do you want from LinkedIn?" (the three goals)
  - Then a progress screen while the jobs run. It ends on "Review your strategy", which links to `/strategy`.
- A "Set up later" link is always visible.

- [ ] **Step 1: Write the failing tests, with a fake AI**
  - `completeSetup` with no posts writes `identity/personal`, creates a strategy and sets `onboardingCompleted`, and does not call `createOwnVoice`.
  - `skipSetup` makes zero AI calls.
- [ ] **Step 2: Run the tests**
  - Expected: FAIL.
- [ ] **Step 3: Implement the service. Invoke frontend-design and build the flow.**
- [ ] **Step 4: Run the tests and `lint typecheck`**
  - Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat: first-run setup`

### Task 11: End-to-end checks and close-out

**Files:**
- Create: `apps/web/e2e/feature1.spec.ts`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Write the Playwright spec (skipped unless `E2E_CLERK_USER_EMAIL` is set). It checks:**
  - Setup → "Set up later" lands on the home page.
  - Memories: add the line "Runs a design studio"; it is visible after a reload.
  - Knowledge: add a 120-word text item; it appears with type Text.
  - Strategy: when `ANTHROPIC_API_KEY` is set, Generate fills Content mix with a legend whose values sum to 100%.
- [ ] **Step 2: Run `pnpm turbo lint typecheck test`, then `pnpm --filter @brandloop/web e2e`**
  - Expected: all pass, or the e2e tests are skipped with the reason printed.
- [ ] **Step 3: Compare screenshots at 1440 and 390 px against the Kleo recon screens**
  - Memories, Knowledge base, Strategy and the picker.
  - No horizontal scroll and no console errors.
- [ ] **Step 4: Tick off Feature 1 in `docs/ROADMAP.md`**
  - Note the deferred items: learning a style from a LinkedIn URL, and sharing.
- [ ] **Step 5: Commit** with the message `test: feature 1 e2e; docs: roadmap`
