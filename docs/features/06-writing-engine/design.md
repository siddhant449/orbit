# Feature 6 design: the writing engine

Status: **draft for review, 2026-10-22.** Plan: `docs/features/06-writing-engine/plan.md`.

The writing engine is everything between "the user asked for a post" and "a post sits in the side panel". The goal is drafts at
least as good as Kleo's: phone-first layout, the user's rules always obeyed, nothing invented, and research that is dated and sourced.

Evidence used here:
- `docs/research/kleo-writing-quality.md` (cited as **WQ §n**). Its evidence ids are used as they are:
  - **A1–A9**: authenticated Kleo GET responses.
  - **L1–L14**: quality-lab turns, verbatim in `.recon/benchmark/kleo-quality-lab.md`.
  - **K1–K9 / O1–O2**: measured drafts, WQ §6.
- `docs/research/orbit-quality-eval.md` (**EV**, run 4) and `.superpowers/sdd/ai-core/task-Q1-report.md` (**Q1**).
- Current code in this worktree: `packages/agent/src/specialists/{prompts,run,grounding,checks}.ts`, `tools/{delegate,index}.ts`,
  `packages/db/prisma/{schema.prisma,presets.ts}` and `packages/db/src/services/voice.ts`.

Rules carried over from the AI core:
- No real creator's name in presets, prompts, fixtures or copy.
- No Kleo prompt text and no creator post text copied into Orbit. Kleo content is data.
- No live AI in tests.
- Nothing posts to LinkedIn.

---

## 1. Why Kleo's drafts are good, and where Orbit stands

| Driver (WQ §7 rank) | Kleo (evidence) | Orbit today (code / EV) |
|---|---|---|
| 1. Measured style profiles | 9 compiled creator profiles, 82–100 posts each, with numeric `mobileFormatting`, do/don't rules, 6 signature moves, 8 final checks and 5 reference posts (A1, WQ §1.2) | 9 presets are ~4-section prose guides with no numbers and no example posts (`presets.ts`). The own style is the same prose built from ≥3 pasted posts (`voice.ts createOwnVoice`) |
| 2. User rules first, nothing invented | The brief says "prioritize their saved voice" (L2). It asks for missing facts (L1). Hook rules refuse invented anecdotes, and P.S. is banned despite 76% of the corpus using one (A1) | Rules sit in the prompt only. Task 10 checks cover length, hook ≤200, hashtags, banned words, placeholders, markdown, links and emoji, but not dashes, P.S., lines per block, fold or invented numbers |
| 3. Phone-first grouping | Adjacent 2–4 line blocks, lists without blank lines, 43–51-char hooks (K1, K8, K9) | Every sentence is its own block (O1: 14 one-line blocks, max 1 line per block). No lists at all. The prompt says "Short paragraphs separated by blank lines" |
| 4. Research with freshness | 3 server prefetch searches with explicit date windows, then `site:` follow-ups, a freshness contract, dated primary sources and exclusions, and a `Sources:` line (L5). It widened "this week" to the whole month | The provider `web_search` tool with no date window, no source format and no dated-claim check (`tools/index.ts`) |
| 5. Typed hooks with a body contract | 11 purposes and `spine{claim, mustDeliver, bodyShape}`, but in practice all 5 hooks were "curiosity" (L8, B-d) | Hook options are a numbered list in text, with no purpose, no picker cards and no variety guarantee (EV gap) |
| 6. Libraries | 4 frameworks, a template library with slot skeletons, 15 categories (WQ §2) | 4 short skill notes (`SKILL_NOTES`) |
| 7. Polish rubrics | proofreadPost, analyzePost with 5 fixed criteria (L11, L12); rateDraft failed (L10) | Final review only. Feedback sometimes puts a nitpick in the top three (EV (f)) |

**The conclusion that drives this design.** Kleo's quality comes from data and contracts, not a magic prompt (WQ summary). Its
best drafts are the ones that went through the writing specialist (K1, K8, K9). Its inline drafts are its worst (K3–K6). Orbit
already wins the blind pairwise 6–0, but that comparison is unfair (EV caveat), and Orbit loses on the measurable layout (§6 table).
So the engine has six parts:
- profiles measured in code (§2)
- an explicit rule precedence (§3)
- a block-structured writer with a deterministic validator and a bounded repair pass (§4)
- a hook and format library with forced variety (§5)
- server-side research with a freshness contract that is enforced in code (§6)
- an eval that measures all of it on the same profile as Kleo (§7)

## 2. Style profiles

### 2.1 Format

A compiled, versioned JSON document, validated by `StyleProfileSchema` (zod, in `packages/ai/src/schemas/style.ts`, because `db`
depends on `ai`). Its shape follows the categories Kleo's `generationVoice` covers (A1). The field names and wording are ours.

```ts
type Range = { low: number; typical: number; high: number };          // p10 / median / p90 of the corpus
type DoDont = { do: string[]; dont: string[] };                         // ≤7 each, ≤200 chars each
type StyleProfile = {
  schemaVersion: 1;
  language: string;                                                     // "en-GB" | "en-US" | …; drives spelling
  voiceTarget: string;                                                  // ≤600 chars, "Write as someone who…"
  rules: { hooks: DoDont; rhythm: DoDont; formatting: DoDont; diction: DoDont; closings: DoDont; global: DoDont };
  signatureMoves: { label: string; pattern: string; useWhen: string }[];   // ≤8; pattern is a fill-in template with [slots]
  finalChecks: string[];                                                // ≤10 yes/no questions
  layout: LayoutTargets;                                                // computed in code, never by the model
  referencePosts: { text: string; postType: PostType; note: string }[]; // 3–5, the style owner's own posts
  source: { kind: "preset" | "own"; postCount: number; corpusHash: string; compiledAt: string; model: string | null };
};
type LayoutTargets = {
  hookChars: Range; hookMobileLines: Range; postChars: Range; blocks: Range;
  blockLineMix: { one: number; two: number; threePlus: number };        // % of prose blocks by mobile lines
  proseBlockChars: Range; sentenceWords: Range;
  listPosts: { bullet: number; numbered: number };                      // % of posts
  emoji: { perPost: number; positions: ("line-end" | "cta" | "line-start")[] };
  hashtagsPerPost: number; postscriptPercent: number; linkPercent: number;
  endings: Record<EndingType, number>;                                  // % question | rule | cta | statement | sources
};
type PostType = "story" | "framework" | "how-to" | "analysis" | "opinion" | "news" | "short";
```

**Decision: the layout numbers are computed in code (`measureCorpus`), not by the model.**
- Kleo's measured blocks are explicitly machine-measured: "### Measured layout signature" and `mobileFormatting` (A1).
- A model asked to estimate "% one-line blocks" makes the number up, and the validator (§4) needs exact numbers.
- The model writes only what code can't: `voiceTarget`, the do/don't rules, signature moves, final checks, and which of the posts to
  keep as references (by index, checked by the server).

Phone measurements use one module, `packages/agent/src/writing/measure.ts`, which the profile compiler, the validator, the UI
readout and the eval all share:
- **Mobile line wrap:** 50 characters per line, Kleo's `charactersPerLine` (A1).
- **Fold:** about 210 characters or 3 mobile lines (WQ §8.9). WQ says to check this before shipping, so it is a named constant
  (`LINKEDIN_FOLD_CHARS`), and §9 lists it as an open question.

### 2.2 Sources

**(a) The user's own posts.** The voice dialog accepts:
- **Pasted posts:** 3–30, each ≥200 characters. Today's minimum is 3 (`validateVoicePosts`); the cap rises to 30.
- **LinkedIn's data export:** the `Shares.csv` (or `.zip`) file that LinkedIn's "Get a copy of your data" produces. The file is parsed
  on the server, the newest 100 original posts are kept, and reshares and empty rows are dropped. The user downloads the file
  themselves, so nothing is scraped. Kleo instead imports from a LinkedIn profile URL (static, WQ §1.3). We skip that route because
  it means scraping.
- **Orbit's own posts:** the profile's posts marked published or copied. This option appears later, once posts carry a published
  status (Feature 4).

Posts go into `StyleCorpusPost`. Then a `STYLE_EXTRACT` job runs these steps:
1. `measureCorpus(posts)` computes the layout targets.
2. One structured call on the `extract` model writes the descriptive parts. The posts are in `<posts>` tags and treated as data.
3. The server checks the result:
   - Every `referencePosts` index exists.
   - Every rule is under the length cap.
   - No rule names a real person.
4. The compiled profile is saved as version N+1.

The job's status moves `PENDING → ANALYZING → READY | FAILED`, and the dialog polls it. Kleo polls every 8 s and refuses a style
until it is "ready" (WQ §1.3). An unchanged `corpusHash` skips the model call.

What the extractor does with the corpus:
- It describes habits. It doesn't turn them into commands that would break the user's rules.
- A measured P.S. habit becomes `postscriptPercent`. Whether a P.S. is allowed is decided by precedence (§3), not by the profile.
  This mirrors Kleo's "Never add a P.S. … regardless of observed frequency" (A1).

**(b) Orbit's presets, written from scratch.** The 9 invented personas in `presets.ts` keep their names and taglines. Each gets:
- 4–5 original reference posts, written for this feature in our own words, about invented situations. They never copy, paraphrase
  or name a real creator.
- Do/don't rules, signature moves and final checks, written by hand.
- `layout` = `measureCorpus(referencePosts)`, widened by a fixed tolerance. The numbers are honest about the exemplars, and a unit
  test asserts every preset's layout matches its own posts.

The 9 personas cover the spread Kleo's presets show (WQ §1.1 table):
- long list-heavy posts
- long story posts
- ~200-char one-block aphorisms
- numbered teaching lists
- 2-block punchy posts

This spread matters for the directional eval in §7. The presets are seeded idempotently by slug with a `PRESET_PROFILE_VERSION`.

### 2.3 Storage and versioning

Decision: **extend `VoiceStyle`**, don't add a parallel table. The picker, `Profile.voiceStyleId`, the composer's
`selectedWritingStyleId` and `buildGrounding` already resolve a `VoiceStyle`. A new table would fork every one of those paths.

| Change | Why |
|---|---|
| `VoiceStyle.profile Json?`, `profileVersion Int @default(0)`, `status StyleStatus @default(READY)`, `statusDetail String?`, `analyzedPostCount Int @default(0)`, `analyzedAt DateTime?`, `corpusHash String?` | The compiled profile and its job state. These mirror Kleo's `voiceAnalysisVersion`, `voiceCorpusHash`, `voiceAnalysisStatus`, `analyzedPostCount` and `analyzedAt` (A1) |
| `VoiceStyleVersion {id, voiceStyleId, version, profile Json, corpusHash, createdAt}`, unique on (voiceStyleId, version), last 10 kept | A re-extraction can make the style worse, and the user can restore an earlier version |
| `StyleCorpusPost {id, voiceStyleId, text, source PASTE\|EXPORT\|ORBIT, postedAt?, hash}`, unique on (voiceStyleId, hash) | A 100-post corpus doesn't belong in `samplePosts String[]`. The hash dedupes re-imports |
| `VoiceStyle.guide` is kept, now rendered from the profile (`renderProfileGuide`) | Older readers keep working: the orchestrator's style name, the `voice/style` memory mirror, and any legacy row without a profile |

Every draft records `sourceRevisions.style = {voiceStyleId, profileVersion}` on its handoff envelope. The eval can then tie a draft to
the exact profile that produced it, without a migration, because envelopes are already persisted in message parts.

### 2.4 Injection into the writer (budgeted)

`renderStyleBlock(profile, effectiveRules, {postType, budget: 7_000})` replaces the `<voice>` block, which today is capped at 6,000
characters (`GROUNDING_CAPS.voice`). Parts are added in priority order and the renderer stops when the budget runs out:

| # | Part | Approx. chars | Always? |
|---|---|---|---|
| 1 | Effective hard rules (§3) | ≤400 | yes |
| 2 | Layout targets as plain sentences ("Hook: one mobile line, 40–55 characters. 7–10 blocks. Group 2–3 related lines…") | ≤700 | yes |
| 3 | `voiceTarget` | ≤600 | yes |
| 4 | Do/don't for hooks, formatting and rhythm, after rules that conflict with the user's rules are dropped | ≤1,600 | yes |
| 5 | Signature moves (top 4 whose `useWhen` fits the post type) | ≤700 | if room |
| 6 | Reference posts: 2 by default, matching post type first, then shortest first; 1 when the budget is tight | ≤2,400 | if room |
| 7 | Diction and closings do/don't, then `finalChecks` | rest | if room |

Other choices:
- The block goes in the specialist's prompt as data. The specialist system prompt stays byte-identical, so the prompt-prefix cache
  keeps working.
- The orchestrator never sees the profile, only the style name. This matches Kleo, where a draft that skips the writer ignores the
  profile (K3, WQ §1.4). Orbit's prompt already forbids inline drafts.

## 3. Rule precedence and no invention

### 3.1 Precedence

From strongest to weakest:

**explicit instruction in this turn > the user's saved hard rules > the user's soft rules > the selected style's rules > the style's measured targets > Orbit's defaults**

Evidence for this order:
- Kleo's brief: "requested … Justin Welsh, but prioritize their saved voice" (L2).
- The bullets in K1 came from the user's rule, not from the profile (WQ §1.4).
- The P.S. habit is overridden in the profile itself (A1).

`resolveRules({ userRulesMarkdown, style, turn })` → `EffectiveRules`:
- **`hard: HardRules`.** Parsed deterministically from `writing/rules` by `compileHardRules`. The parser recognises plain phrasings
  ("No emojis", "no em dashes", "no hashtags", "never add a P.S.", "≤3 lines per paragraph", "British spelling", "never open with a
  rhetorical question", a "Banned words" section, "no links") and returns which line produced each rule.
  - Kleo has the matching slot (`hardRules {forbidEmoji, forbidDashes, bannedPhrases, requireNumerals, forbidPostscript,
    requireShortBlocks}`, A1), and the account's rules are exactly these (A2).
  - The parser is pure code, so the Memories screen can show "Enforced as checks: No emoji · No dashes · ≤3 lines per block"
    next to the rules. When a rule isn't recognised, the user can see that it stays a prompt instruction only.
- **`targets: LayoutTargets`.** The style's numbers, clamped by hard rules: `forbidEmoji` → emoji 0, `maxBlockLines: 3` caps
  `threePlus`. With no style, Orbit's defaults are taken from the band of Kleo's best drafts (K1, K8, K9):
  - hook 40–60 characters, one mobile line
  - 650–1,300 characters
  - 6–11 blocks
  - at least one multi-line block
  - a list when the post type is framework or how-to
- **`soft: {source, text}[]`.** The user's soft rules come first, then the style's rules.
- **`dropped: {text, reason}[]`.** Style rules and signature moves that conflict with a hard rule, for example an emoji CTA move
  when `forbidEmoji`. They are logged in the envelope's findings and never reach the writer.

**Overrides in a single turn.** Kleo honoured a one-off "include emojis" request partly, with one emoji (L14). In Orbit:
- `delegateWriting` takes `overrides: {allowEmoji, allowHashtags, allowDashes, allowPostscript, allowLinks}`, each nullable.
- The server accepts an override only when the user's latest message contains the matching word (emoji, hashtag, dash, P.S., link).
  A model can't loosen the user's rules on its own.
- An override applies to that draft only and is reported in the reply.

### 3.2 No invention

- **Facts carry provenance.** The writer returns `facts: {text, source: "request"|"knowledge"|"memory"|"research"|"general", ref}[]`
  next to the draft. Two deterministic checks run on the rendered text:
  - **Number provenance:** every numeral, percentage, currency amount and duration in the post must appear in the request, the
    grounding or a research item, after normalising "90 percent" to "90%" and "€40" to "40 EUR". A number that fails is a hard
    violation.
  - **Date provenance:** every calendar date must match a research item or the request.
- **Missing facts become questions, not inventions.**
  - The writer returns `missingFacts[]` with `readiness: "needs-user-input"`, as today (`clarifyingQuestion`).
  - The orchestrator shows a picker (AI core Task 13) with "Answer these" (free input), "Write it without personal details", and
    "Use an example from my knowledge base" (shown only when `searchKB` had hits). This copies Kleo's L1 → L2 sequence with the
    choice made explicit.
  - The ledger gains `missingFacts: string[]` (defaulting to `[]`, so stored v1 rows still parse).
  - The picker's answer becomes facts with `source: "request"`.
- **"Without personal details" is a mode, not a hint.** The brief carries `personalDetails: "none"`. The writer then writes claims
  about the subject, never "I/my/we" experience claims. A lint rule flags first-person experience verbs ("I hired", "my client",
  "we built") when the mode is `none`.
- **Memory learning must not learn from the framing of a task.** Kleo stored "Has hired their first engineer" from a request that
  said "skip personal details" (WQ §5, A7). AI core Task 15 gets two amendments (plan task W11):
  - A turn whose user text is a writing request is `learningExcluded`, unless it states first-person facts. Picker answers are
    also excluded, as Task 13 already says.
  - An eval case asserts that no memory is written.

## 4. Layout engine

### 4.1 The writer outputs blocks; the server renders text

Decision: the post writer returns **structured blocks**, not a free-text draft:
`blocks: {kind: "hook"|"prose"|"bullets"|"numbered"|"close"|"sources", lines: string[]}[]`.

`renderBlocks` joins lines inside a block with `\n` and blocks with a blank line. Bullet or numbered prefixes follow the style
(`-`, `•` or `1.`). Two of Kleo's guarantees become impossible to break, where today the prompt only asks for them:
- list items are adjacent, never blank-separated
- related lines are grouped

These were the biggest measured gap: O1 has 14 single-line blocks and never a list. Kleo's profiles warn "Don't convert every
sentence into its own blank-separated paragraph" (WQ §6).

`payload.draft` still exists, rendered by the server, so `createDocument`, the envelope and Task 10 work unchanged.

The writer's prompt drops "Short paragraphs separated by blank lines" and "no bullet symbols unless the voice uses them" (both in
`specialists/prompts.ts` today). It adds:
- Group 2–3 related lines in a block; start a new block only when the idea shifts.
- Use a list for parallel items; match structure to the post type. This is the user's own Kleo rule (A2).
- The hook fits one or two mobile lines and the post's promise sits before the fold.

### 4.2 Validator

`lintPost(text, effective, ctx)` → `{ metrics: PostMetrics; violations: Violation[] }`. Each violation is `{id, level, detail, block}`:
- `level: "hard"` must be fixed.
- `level: "target"` is fixed if cheap and reported otherwise.
- `level: "advice"` is only reported.

| id | Rule | Level |
|---|---|---|
| `emoji`, `dashes`, `hashtags`, `postscript`, `links`, `banned-phrase`, `rhetorical-opening` | From `HardRules` (em dash and en dash used as punctuation; hashtags; a final block that starts with "P.S."; URLs, unless this is the sources block and sources are allowed) | hard when the user set the rule, otherwise target against the style |
| `block-lines` | No prose block over `maxBlockLines` mobile lines (user rule), or over 4 when no rule is set | hard / target |
| `hook-length` | Hook ≤ `targets.hookChars.high` and ≤ 2 mobile lines (≤100 chars) | target, or hard above 2 mobile lines |
| `fold` | The hook ends, and the post's promise (block 1–2) starts, before `LINKEDIN_FOLD_CHARS` | target |
| `one-line-blocks` | Not every block is a single line when there are ≥6 blocks (share ≤ `blockLineMix.one + 15`) | target |
| `list-adjacency` | No blank line between list items | hard (only reachable on edited text, because the renderer prevents it) |
| `post-length` | Within `targets.postChars` (low − 15% … high + 15%) and ≤3,000 | target / hard over 3,000 |
| `list-expected` | The post type is framework or how-to and there is no list block | advice |
| `number-provenance`, `date-provenance`, `first-person` | §3.2 | hard |
| `placeholders`, `markdown` | As in Task 10 | hard |

**Task 10's checks are extended, not replaced.**
- `runDeterministicChecks` keeps its 8 results in order, because existing tests and the final-review UI depend on them.
- A new `runWritingChecks(text, effective, grounding)` maps the lint to `CheckResult`s with new `CheckId`s.
- The final review shows both, and `passed` is false on any hard failure.

### 4.3 Repair pass (bounded)

`polishDraft` runs after every draft or edit, in `delegateWriting`, `updateDocument` and `proposeDocumentEdits`:
1. **Mechanical fixes** in code, for changes that can't alter meaning:
   - strip markdown bold
   - drop a trailing hashtag-only line when hashtags are forbidden
   - drop a final P.S. block when it's forbidden
   - collapse three or more newlines
   - normalise bullet glyphs
2. **One model repair** when hard or target violations remain. The same writer is called with its own blocks and a numbered list
   of violations with block indices ("Block 4 is 5 mobile lines; split it or cut it to ≤3"). It returns blocks, which are linted again.
3. **Last resort for character-level hard rules only.** Emoji is removed, and " — " or " – " becomes ", ". The envelope says
   "fixed mechanically" so the reviewer can check the sentence.
4. **Report** remaining target misses as envelope findings. The orchestrator mentions at most one, in plain words.

Bounds:
- At most one model repair per draft.
- The repair is skipped when fewer than 20 s remain before the turn deadline.
- Steps 2–4 cost nothing when the draft is clean, which is the common case.
- Latency target: a draft turn stays ≤40 s at p50. Today it is 35–40 s (EV run 4); the eval tracks it.

### 4.4 Phone readout in the side panel

The document panel shows a read-only layout strip computed by `measurePost` on the current text:
- "Hook · 1 line on mobile"
- "9 blocks"
- "List ✓"
- "Fits before *see more*" or "Promise is after the fold"

It also shows the enforced checks with their pass or fail state. The strip makes the engine visible, it is the e2e anchor for several
tasks, and it needs no model.

## 5. Hook and format library

All the data lives in `packages/agent/src/library/*.ts`, written by us with no creator names. AI core Task 11's skills become
renders of this data, so there is one source (§8).

- **Hook purposes, 12:**
  - claim, contrarian, mistake, how-to, comparison, curiosity
  - story, proof, number, prediction, question, announcement
  - Each has `{id, label, explainer, evidence: "none"|"story"|"number"|"news", examples: 2 original fill-in templates}`.
  - **Evidence gates:**
    - `story` needs a story fact in the grounding or the request.
    - `proof` and `number` need a number that will pass number provenance.
    - `announcement` needs news supplied in the request or research.
    - `question` is unavailable when `forbidRhetoricalOpening` is set.
  - Kleo has 11 purposes, with Proof and Stat evidence-gated (static, WQ §2.4).
- **Frameworks, 6:**
  - story → lesson → steps → question
  - problem → agitate → solve
  - attention → interest → desire → action
  - before → after → bridge
  - myth → truth → proof
  - list with a rehook at ~60%
  - Each is `{id, name, description, plan: BlockPlan}`, where a `BlockPlan` is an ordered list of block kinds with line ranges.
  - This is the idea behind Kleo's 4 frameworks and its "rehook" layer (WQ §2.1), not their text.
- **Categories, 15, and templates, 24.**
  - The categories are our own descriptions of the generic post taxonomy (educational, story, opinion, case study, framework,
    listicle, news, prediction, comparison, lesson, behind the scenes, announcement, engagement, authority, personal).
  - Each template is a slot skeleton with a "why it works" note and evidence needs. Unfilled `[slots]` fail the placeholders
    check. Kleo has the equivalent (A4).
- **Format selection.** `selectFormat({request, selectedFormatId, postType, style})` returns a `BlockPlan` for the writer's
  `<format>` block. An explicit pick in the composer's new "Format" menu wins. Otherwise the post type implies one, following the
  user rule "story = paragraphs, framework = bullets, analysis = chunky essay, short = tight lines" (A2), and the style's list share
  breaks ties.
- **Hooks with forced variety.** `generateHooks` replaces the shape in Task 11.
  1. The server picks the purposes first: `pickPurposes(count, gates, recentlyUsedInChat)` returns distinct purposes. With ≥3
     hooks there are at least 3 distinct purposes, and purposes from the last set in this chat are avoided until exhausted.
  2. The model writes one hook per assigned purpose, plus a `spine {claim, mustDeliver, bodyShape}`.
  3. The server computes `charCount` and mobile lines, lints each hook against the hard rules, and drops near-duplicates (token
     Jaccard ≥0.6). It regenerates the dropped ones once.
  - Kleo's set was all "curiosity" twice (L8, B-d); this is the gap to beat.
- **Hook picker cards.** Each card shows a purpose badge, the hook, "1 line · 48 chars" and "Use this hook".
  - Picking a hook sends the Task 13 `hook` control. With a post open, it swaps the opening deterministically; with no post, the
    hook and its spine go into the writer's brief as a contract, and the final review checks that `mustDeliver` is met.
  - Kleo forks a chat with a hidden `chosenHook {text, format, trigger, spine}` (static, WQ §2.4). Orbit keeps the same chat.

## 6. Research step

### 6.1 Contract

When Orbit researches:
- **Gate:** the composer's web toggle (`webSearchEnabled`) stays the permission gate, for cost and consent.
- **Prefetch:** when the toggle is on and `isTimely(userText)` fires, the server runs a prefetch before the model's first step,
  as Kleo does (L5). `isTimely` matches "today / this week / latest / news / trending / just announced / this month", a year or
  month name, and the `trending-in-niche` and `news-to-post` flows.
- **Follow-ups:** the orchestrator can also call `researchTopic` for follow-ups, at most 2 per turn.
- **Toggle off:** a timely request gets "Web search is off, so I can't check this week's news. Turn it on and ask again." The
  writer is told not to state current events.

How a research run works:
1. **Window:** `resolveWindow(text, now, tz)` turns "today", "yesterday", "this week" (Monday to today in the user's timezone),
   "last week", "past N days", "this month" or a named month into `{start, end, label}`.
   - The default for a timely request with no window is the last 7 days.
   - **The week stays a week.** Kleo widened "this week" to the whole month (L5); we don't.
2. **Queries:** up to 3 facet queries run in parallel:
   - (a) official announcements on the topic in the window
   - (b) the same for the user's audience and pillars, taken from the strategy, not the chat. Kleo built its facets from chat
     topics (L13).
   - (c) data or reports
   - Each query text carries the window in words ("October 19–22 2026") and our own freshness contract:
     - only sources published inside the window
     - a roundup only counts for news inside the window
     - the exact publication and event date for each item
     - say plainly when nothing qualified
3. **Normalise:** one `extract`-model call returns `ResearchItem {id: "r1"…, published, eventDate, claim, url, publisher,
   role: "primary"|"corroboration"}`.
4. **Server checks:**
   - The URL must be one the provider actually returned. Invented URLs are dropped.
   - Dates are parsed. Items outside the window or undated become `Exclusion {claim, url, reason}`.
5. **Brief:** the result is a `ResearchBrief`, stored per chat, with items, exclusions, window, provider, `searchCount` and
   `createdAt`. A brief for the same chat, window and topic less than 24 h old is reused, as Kleo reused L5's results in L13.
6. **Writer:** gets `<research window="…">` with item ids. A fact with `source: "research"` must cite an item. The
   `date-provenance` lint enforces this, and the post names dates inline as K4 does.
7. **Reply:** the dated items with a one-line implication each, the angle, and what was excluded and why, as L5 does. The
   sources stream as rows under the step (Task 6 already persists `source-url` parts).

**Sources line.**
- The writer never types a URL. The server renders the `sources` block from the cited items: "Sources: OpenAI (21 Oct),
  Microsoft (19 Oct)" with links.
- Decision: the sources line goes **in the chat reply by default, and in the post only** when the user asks, or when their rules
  contain a "sources line" rule. Links in a post body can cost reach, and the default links limit is 1.
- Kleo puts it in the post (K4). This is listed in §9 for the user to confirm.

### 6.2 Provider and limits

`ResearchProvider { id; search(q: {query, window, maxResults}, signal): Promise<{answer, citations: {url, title, snippet}[]}> }`:
- **`openaiResearch` (default):** `generateText` on the `extract` model with `openai.tools.webSearch({searchContextSize: "medium"})`
  required. Citations come from the result's sources. This reuses the existing provider (`packages/ai/src/provider.ts
  webSearchTool`), which the orchestrator's own `web_search` uses today.
- **`perplexityResearch(apiKey)`:** selected when `RESEARCH_PROVIDER=perplexity` and `PERPLEXITY_API_KEY` is set. It maps the
  window to Perplexity's recency and date filters; the parameter names are checked when the task is implemented. Kleo uses
  Perplexity (L5).
- Unit tests use fake fetch only.

| Limit | Value |
|---|---|
| Prefetch searches per turn | 3 (parallel) |
| `researchTopic` follow-ups per turn | 2 |
| Per-search timeout | 20 s; the prefetch's wall time is capped at 25 s |
| Searches per profile per day | 40, counted from `ResearchBrief.searchCount`; over the cap returns `Refused: today's research limit is reached.` |
| Brief in the prompt | ≤4,000 chars to the writer, ≤2,500 to the orchestrator |
| Cost | About 3–5 search calls plus one normalise call per researched turn. The live smoke prints the token counts; pricing is checked then |

The orchestrator's direct `web_search` tool is removed once `researchTopic` ships. That gives one path with the freshness contract,
instead of two.

## 7. Evaluation

The eval is extended in `packages/agent/eval`. Everything below runs from `pnpm --filter @brandloop/agent eval`, with the suite chosen
by flag.

1. **Formatting metrics, at no AI cost.**
   - `eval/metrics.ts` wraps `measurePost` (the same module as §2.1) and computes, per draft: words, characters, lines, blocks,
     average characters per line, maximum mobile lines in a block, blank-line ratio, one-line block share, hook characters and
     mobile lines, the fold, list counts, emoji, hashtags, dashes, P.S., links, numbers and the ending type.
   - Run over saved transcripts (`orbit-run-*.json`) and the Kleo `post` fences, it reproduces the WQ §6 table in TypeScript and
     gives a baseline before the writer changes.
2. **Hard checks per draft:** zero hard violations, number and date provenance, no first-person claims in `personalDetails: none`.
3. **Suites:**
   - **presets:** same topic × 3 presets (long-list, aphorism, numbered-teaching) → the measured layout moves the expected way
     (aphorism `postChars` < 400; numbered-teaching has a numbered list; long-list has ≥2 lists or one list of ≥4 items). Kleo
     shifted structure with style but ignored it on inline paths (WQ §1.4).
   - **research:** a frozen provider fixture with items inside and outside the window → every dated claim maps to an item, no
     out-of-window item reaches the post, and exclusions are listed.
   - **hooks:** 5 hooks → ≥4 distinct purposes and no gated purpose without evidence.
   - **privacy:** "skip personal details" → no first-person experience claims and no memory write. This is the regression for Kleo's
     false fact (A7).
   - **feedback:** a draft seeded with a hard-rule violation and one cosmetic nit → the violation ranks first and the nit is not
     in the top 3 (EV (f)).
4. **A fair comparison with Kleo on the same profile.**
   - The existing pairwise judge used different profiles for Orbit and Kleo, which overstates Orbit's win (EV caveat).
   - The new **parity** fixture seeds an Orbit eval profile from the user's own Kleo data, captured read-only into
     `.recon/benchmark/kleo-profile.json`, which is gitignored and never committed:
     - `/api/user-writing-style` dos and don'ts → `writing/rules`
     - `/api/user-memory` sections → `voice/style`, `identity/*`, `topics/*`, `strategy/*`
   - The parity prompts are the L1–L8 requests, so Kleo's K1–K9 are the opposite side, written for the same person.
   - Kleo's creator profile can't be imported, because it describes a real creator. So Orbit runs with no preset, and the judge is
     told to score rule compliance, layout and craft, not likeness to any style.
   - The suite is skipped when the file is absent.
5. **Thresholds to beat** (the gate in plan task W12):

| Metric | Kleo best (K1/K8/K9) | Orbit run 4 (O1/O2) | Target |
|---|---|---|---|
| Hard-rule violations | 0 | 0 after the em-dash fix | **0** (blocking) |
| Hook characters / mobile lines | 43–51 / 1 | 47–63 / 1–2 | within the profile range; default ≤60 and 1 line in ≥80% of drafts |
| Max mobile lines in a block | 2–4 | 1 | ≥2 in ≥80% of drafts with ≥6 blocks |
| One-line block share | 56–80% | 100% | ≤85% |
| List on framework, how-to or compare prompts | yes | never | yes in ≥90% |
| Post characters | 750–851 | 584–1,330 | inside the profile's `postChars` range |
| Number and date provenance | n/a | n/a | 100% |
| Distinct purposes in a set of 5 hooks | 1 | n/a | ≥4 |
| Research: dated claims sourced / out-of-window items | 100% / window widened | n/a | 100% / 0 |
| Judge "LinkedIn craft" | — | 4.20 | ≥4.5 |
| Parity pairwise (same profile) | — | — | Orbit ≥4 of 6, with 0 hard-rule failures |
| Draft latency p50 | ~35–40 s | 37.7 s | ≤40 s |

## 8. Knowledge base: does Orbit need to add knowledge?

**Short answer: no shared "writing advice" knowledge base. The craft knowledge goes into code. Each user's own knowledge base matters,
and the product should ask for the right material.**

What helps, and where it belongs:

| Knowledge | Where | Evidence |
|---|---|---|
| The user's proof material: client cases with numbers, dated stories, workshop notes, opinions they hold, questions clients ask, offers | **The user's knowledge base** (already exists, hybrid search) | EV run 3: memory/strategy use went from 3.33 to 5.00 and craft from 3.80 to 4.20 once drafts used knowledge-base facts. O1/O2's numbers came from the knowledge base. Kleo's KB-attached draft changed voice (K6, weak signal) |
| The user's best past posts | **The style corpus** (§2.2), not the knowledge base. Posts teach layout and voice; chunked retrieval would only return fragments of them | A1 (profiles built from 82–250 posts) |
| Platform facts: mobile wrap, fold, hashtag and link effects | **Constants in `writing/measure.ts`** plus validator rules, checked before shipping | WQ §8.9 |
| Hook purposes, frameworks, categories, templates | **`library/*.ts`** (code data, versioned with the app) | WQ §2, §8.4 |
| This week's news | **`ResearchBrief`** per chat, short-lived | L5, L13 |

What does not help:
- **Generic LinkedIn-advice articles.** They add retrieval noise to the 5 chunks the writer gets (`SEARCH_CHUNKS = 5`).
- **Other creators' posts to imitate.** This is a policy no. Kleo itself refused exact imitation (L14).
- **Trend articles pasted into the knowledge base.** They are stale by the time they are retrieved.
- **AI-written filler.** It teaches the voice the wrong thing.

Kleo's inspiration feed and swipes never reached its writer in any observed turn (WQ §4.2).

Product change (plan task W4): the knowledge-base empty state and "Add" dialog gain a short "What makes drafts better" list:
- a client result with numbers
- a story with a date
- an opinion you'd defend
- a question clients ask
- notes from a talk or workshop

The draft path's `searchKB` already finds these items.

## 9. Open questions for the user

1. **Fold and wrap constants.** LinkedIn's "see more" fold (~210 characters / 3 mobile lines) and the ~50-characters-per-line wrap
   need one manual look in the user's own feed, read-only, before W1 ships them as constants.
2. **Parity fixture consent.** Can we capture the user's Kleo rules and memory (A2, A7) with read-only GETs into `.recon/`
   (gitignored), and use them as a local-only eval profile?
3. **Sources line default.** In the chat reply only (our default), or in the post as Kleo does (K4)?
4. **Live budget.** W12's live eval is 2 full runs plus the parity suite. The Q1 runs used about 100k tokens each. A Perplexity key
   is optional; OpenAI web search is the default.

## 10. Overlap with AI core Tasks 11–15

| AI core task | Overlap | Proposal |
|---|---|---|
| **11** Identity and strategy specialists, skills, hooks, analysis, web search | `generateHooks`, `analyzePost`, skill bodies, web search | **Trim 11** to: `delegateIdentity`, `delegateStrategy`, the skills index and `runSkill`, and `source-url` persistence. Its skill bodies are rendered from `library/*` (W7). `generateHooks` is **replaced by W7**, `analyzePost` **by W10**, and web search **by W9** (`researchTopic`). Run trimmed 11 before W7 |
| **12** Flow catalogue | Flows route to `generateHooks`, `analyzePost`, research | **Keep.** Routes point at the W tools. `news-to-post` and `trending-in-niche` set `needsWebSearch` and trigger the W9 prefetch |
| **13** Pickers and control messages | Hook cards (`hook` control, `swapHook`), the missing-facts picker, the idea picker | **Keep, and run before W7.** W5's missing-facts flow and W7's cards use its `presentOptions` and `hook` control. W5 ships a plain-question fallback, so it doesn't block on 13 |
| **14** Menus, quick actions, chips | The "Format" menu (W8) sits next to the flow menu | **Keep**, after W8, sharing the composer touch point |
| **15** Learning loop | Learning from the framing of a task (§3.2) | **Amend** (in W11): writing-request turns are `learningExcluded` unless they state first-person facts, and the privacy eval case is added |

Recommended order: W1 → W2 → W3 → W4 → W5 → W6 → [AI core 11 trimmed, 12, 13] → W7 → W8 → W9 → W10 → W11 (+ amended 15) →
[AI core 14] → W12.

## 11. Out of scope

- Learning the style from the user's own edits (USER_EDIT diffs). This is a later signal; it needs W12's metrics first.
- Engagement-weighted inspiration feeds (A9) and image-to-text swipe files (A8).
- Carousel and visual writing (Feature 5).
- Importing a style from a LinkedIn URL, because it needs scraping.
