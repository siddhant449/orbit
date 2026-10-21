# Feature 1 design: voice, memories, strategy, knowledge base

Status: **approved 2026-10-21**, with the user's answers on voice presets and video folded in. Based on `recon.md`, written the same day.

## Intent

The AI can only write in someone's voice if it knows four things:
- who they are
- how they write
- what they want from LinkedIn
- what they know

Feature 1 builds those four stores for each profile, plus the screens to view and edit them. Feature 2's chat reads all four
and later writes back into them.

## What we copy from Kleo

- **Memory as keyed markdown documents** for each profile, such as `identity/about`, `writing/rules`, `voice/style`,
  `topics/<slug>` and `strategy/themes`. Markdown is easy to put in a prompt, easy to show, and easy to edit one line at a time.
- **The strategy model:**
  - goal: get customers, build authority, or grow audience
  - positioning, with why it fits
  - tagline and expertise
  - content mix across five types: lead magnet, personal, authority, sales, educational
  - audience balance across three levels: broad, narrow, niche
  - formats: text, image, carousel, video, newsletter, poll
  - recurring weekly series
- **Knowledge base:** the same five ways to add items, the same list, search, filter and sort, and the same per-item menu.
- **Import memories:** paste text, and it's processed in the background into memories.

## What we do differently

- **Preset writing styles match the kinds of creator voices Kleo offers, under invented names** (user's decision).
  - Nine presets, one for each kind of voice in Kleo's list: the UK personal-brand storyteller, the SEO operator, the solopreneur, the business-buying investor, the copywriter, the internet builder, the one-person-business philosopher, the scale-up offer expert, and the high-agency essayist.
  - Each has a fictional name, a tagline, a style guide in markdown and a generated avatar (initials or an illustration).
  - We use no real names or photos, and we don't copy any creator's posts. The user's own style is added from pasted posts. Learning a style from a LinkedIn URL waits
  for the LinkedIn connection in Feature 3.
- **The strategy page works without the chat.** It has a "Generate my strategy" button: one Claude call that returns structured
  JSON, based on identity, voice and knowledge. Every field can then be edited by hand. Refining through chat comes with Feature 2.
- **Extraction is validated:** a memory is saved only if the model returns a structured fact. Refusals, questions and
  "I need more information" replies are rejected. This avoids the defect seen in Kleo's data.
- **A short first-run setup** replaces Kleo's onboarding, which we couldn't observe:
  1. Role and what you're known for
  2. Paste 3 to 5 of your posts, or skip
  3. Pick a goal
  4. We draft identity, voice and strategy, and you review them

## Data (Prisma, scoped to a profile)

- **`MemoryDoc`:**
  - fields: `profileId, key, content (markdown), source (user | extracted | imported | mirrored), pinned, updatedAt`
  - unique on `(profileId, key)`
- **`Strategy`:**
  - `profileId` (unique), `goal`, `goalWhy`, `positioning`, `positioningWhy`, `tagline`, `expertise`, `expertiseWhy`
  - `contentMix` (JSON), `audienceBalance` (JSON), `contentFormats` (JSON), `recurringSeries` (JSON)
  - `generatedAt`, `updatedAt`
  - JSON fields are checked with zod schemas shared in `packages/ai`
- **`VoiceStyle`:**
  - `id, profileId (null for presets), kind (preset | own | url), name, tagline, guide (markdown), samplePosts[]`
  - `Profile.voiceStyleId` records the selected style
- **`KnowledgeItem`:**
  - fields: `profileId, teamId, title, type (text | document | url | video | image), status (processing | ready | failed)`
  - content fields: `content` (the extracted text), `summary`, `sourceUrl`, `fileKey`, `mimeType`, `sizeBytes`, `error`
  - also `shareScope`, `createdAt`
- **`BackgroundJob`:**
  - fields: `id, kind (memory_import | knowledge_ingest | strategy_generate), status, input, error`, with timestamps
  - runs through Next's `after()` for now; it moves to Inngest in Feature 3

## Screens (built with frontend-design, in the existing shell)

- **`/settings/memories`:**
  - cards for Identity, Writing preferences, Voice and Topics
  - each line can be edited or deleted
  - "Add a memory"
  - the Import memories dialog, with the copy-this-prompt helper
- **`/strategy`:**
  - empty state with "Generate my strategy"
  - **Foundation:** goal, positioning, tagline, expertise, each with why it was chosen
  - **Content mix:** donut chart plus legend with examples; percentages editable and kept to 100%
  - **Audience balance:** a funnel bar
  - **Formats & cadence**
  - **Weekly series**
  - added to the Ideas section panel
- **`/knowledge-base`:**
  - search, type filter, sort and infinite list
  - the Add knowledge dialog with five tabs and the same limits as Kleo
  - item drawer to read or edit the content, and delete
- **Composer writing-style picker:** the current style, "Change style", the list of presets plus your own, and "Add your style" (paste posts)
- **First-run setup:** a short full-page flow shown when a profile has no identity yet

## How files and AI work

- **Files:** an `UploadStore` interface. Development stores files on local disk under `.data/uploads`; S3 or R2 is added later.
- **Text extraction:**
  - PDF: `unpdf`
  - DOCX: `mammoth`
  - XLSX: `xlsx`
  - TXT and MD: read as-is
  - URL: fetch the page, then extract the article text
  - Image: Claude vision describes it
  - YouTube URL: use the video's captions
- **Video** (user's decision): a `Transcriber` chain.
  1. **Deepgram** is tried first, for both uploads and links (YouTube, TikTok, Reels, Facebook), using `DEEPGRAM_API_KEY`.
  2. If the key is missing, Deepgram returns an error, or the account is out of credit (402 / insufficient-funds), it falls back to **YouTube captions** for YouTube links.
  3. If neither works, the item is marked `failed` with a reason.
  - The UI shows a notice in the Video tab and on affected items: "Video transcription is unavailable right now (Deepgram). YouTube links still work using captions."
  - Provider health is exposed at `/api/status/transcription`.
- **Claude calls** go through `packages/ai`. Model IDs are chosen at plan time using the claude-api reference. Uses: strategy
  generation, memory extraction, voice extraction and summaries.
- Needs `ANTHROPIC_API_KEY`.

## Not in scope

- Learning a style from a LinkedIn URL and LinkedIn profile enrichment (Feature 3).
- Sharing knowledge-base items with teammates (Feature 9).
- Chat-driven memory updates (Feature 2).
- Folders and tags in the knowledge base (Feature 4, alongside saved items).

## Calls I made (please check)

- Preset names, taglines and style guides are invented by me.
- How links to TikTok and Reels are fetched for Deepgram: download the media server-side with `yt-dlp` if it's available; otherwise only direct media URLs and YouTube are supported.
- Background jobs run in-process for now.
- Local-disk uploads in development.
