# Feature 6: Writing engine — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orbit's drafted LinkedIn posts match or beat Kleo's on the same profile. Four things get us there:
- measured style profiles
- an explicit rule precedence with no invented facts
- a block-structured writer with a deterministic validator and a bounded repair pass
- a hook and format library with forced variety, plus dated and sourced research

The eval proves it: it measures layout, rule compliance and provenance, and runs a same-profile comparison with Kleo.

**Architecture:**
- **Shared measurements:** `packages/agent/src/writing/` holds the pure modules `measure`, `rules`, `render`, `lint` and `polish`.
  The writer, the final review, the side-panel readout and the eval all use them.
- **Libraries:** `packages/agent/src/library/` holds code data: hook purposes, frameworks, categories and templates.
- **Research:** `packages/agent/src/research/` holds the window, the provider adapter, normalising and the brief.
- **Styles:** the compiled style profile is JSON on `VoiceStyle`. Its schema is in `packages/ai` (so `db` can import it), and it is
  compiled by a `STYLE_EXTRACT` job.

**Tech stack:** as in Feature 2 (`ai` 7.0.146, `@ai-sdk/openai` 4.0.98, Prisma 7.10.1, zod 4, Vitest 5, Playwright). No new runtime
dependency, except a CSV parser for the LinkedIn export (W4). Pin an exact version that passes the release-age policy, and never add
`minimumReleaseAgeExclude`.

**Spec:** `docs/features/06-writing-engine/design.md` (cited as **D §n**).
- Evidence: `docs/research/kleo-writing-quality.md` (**WQ**, ids A1–A9, L1–L14, K1–K9, O1–O2).
- Eval: `docs/research/orbit-quality-eval.md` (**EV**).
- Base plan: `docs/features/02-ai-core/plan.md` (**AC**). Its Global Constraints apply unchanged.

## Global Constraints (in addition to AC's)

- **Kleo evidence in every task.** Each task names the Kleo evidence it answers. Its report quotes the evidence id and says what
  behaviour now matches or beats it. This is a user rule.
- **An e2e flow in every task.** Each task's definition of done includes a Playwright flow in the browser against the mock model
  (`AI_MOCK_MODEL=1`, the dev server started with it). This is a user rule.
  - The implementer writes the spec, `apps/web/e2e/writing-*.spec.ts`, using the `chat.spec.ts` sign-in and cleanup pattern.
  - The controller runs it at the task's gate, because feature agents never run the dev server (AC).
  - A task is done only when its spec is green there.
- **Mock routing.**
  - `scriptedAi()` gains keyword routes: `{ match: RegExp tested on the prompt, output }`. They are tried before the
    schema-first `CANNED` list, so one schema can return different canned outputs per scenario (for example `[e2e:emoji-draft]`).
  - `createScriptedChatModel()` keyword routes are added per task as listed.
  - Canned outputs must parse their schema **and fail every earlier schema in `CANNED`**. Each task adds a unit test for that.
- **No copying.**
  - Preset reference posts, hook examples, templates and frameworks are original writing for Orbit.
  - No real creator's name, post or paraphrase. No Kleo prompt text.
  - Kleo drafts (K1–K9) are read at eval time from `.recon/`, never committed as fixtures.
  - Unit-test fixture posts are written for the tests.
- **User data stays local.** The parity fixture (`.recon/benchmark/kleo-profile.json`) is gitignored, read only by the eval, and never
  copied into tests or docs.
- **Pure first.** `writing/*`, `library/*` and `research/window.ts` import nothing from `@brandloop/db` and can be unit-tested
  without a database.
- **Measurement constants.** `CHARS_PER_MOBILE_LINE = 50` and `LINKEDIN_FOLD_CHARS = 210` live in `writing/measure.ts` only (D §2.1).
  Change them there after the user's check (D §9.1).
- **Migrations** run in this order only: W3 `style_profiles` → W4 `style_extract_job` → W9 `research_briefs`.
  - Before creating one, rebase onto `main` and check `packages/db/prisma/migrations` for newer migrations from other features.
  - A second `migrate dev` must report no pending changes.
- **Budget limits** (D §2.4, §4.3, §6.2):

  | Limit | Value |
  |---|---|
  | style block to the writer | 7,000 chars |
  | research brief | 4,000 chars to the writer, 2,500 to the orchestrator |
  | model repairs per draft | 1 |
  | prefetch searches per turn | 3 |
  | `researchTopic` calls per turn | 2 |
  | searches per profile per day | 40 |
  | timeout per search | 20 s |
  | hooks per set | 3–8 |
  | style corpus | 3–100 posts (paste 3–30) |
  | compiled versions kept | 10 |

## Review Focus

1. **The user's hard rule is broken in a saved post** (emoji, dash, hashtag, P.S., block over the user's line limit, banned
   phrase). Expected: impossible after `polishDraft`. The last-resort pass is logged. Tests: W2, W6, W12.
2. **A number, date or first-person experience the user never gave appears in a draft.** Expected: a hard violation. The draft is
   repaired, or the writer asks for the fact. Tests: W5, W6, W9, W12.
3. **A style rule beats a user rule.** Example: a profile's P.S. or emoji move gets through when the user forbids it. Expected: it is
   in `dropped`, never in the writer prompt. Tests: W2, W5.
4. **A model-proposed override loosens a rule** without the user asking in this turn. Expected: the override is ignored. Test: W5.
5. **A research item outside the window, or with a URL the provider never returned, reaches the post.** Expected: it is an
   exclusion. Tests: W9.
6. **A writing request becomes a remembered personal fact** (Kleo's A7 defect). Expected: no memory write. Tests: W11, W12.
7. **A style extraction leaks another person's posts** (another profile, or a preset's posts) into an own style, or names a real
   person. Expected: refused. Tests: W3, W4.

## Order and gates

| # | Task | Depends on | Live smoke | Gate after |
|---|---|---|---|---|
| W1 | Post metrics, phone readout, metric baseline | AC 10 | — (no AI) | unit + **e2e writing-readout** |
| W2 | Hard rules, effective rules, writing checks | W1 | — | unit + **e2e writing-rules** |
| W3 | Style profile schema, storage, original presets | W1 | — | unit + **e2e writing-presets** |
| W4 | Own-style extraction (paste + LinkedIn export) | W3 | 1 extraction | unit + **e2e writing-own-style** |
| W5 | Writer v2: blocks, budgeted style, precedence, no-invention | W2, W3 | 1 draft | unit + **e2e writing-draft** + parity e2e |
| W6 | Polish and repair pass | W5 | 1 draft with a seeded violation | unit + **e2e writing-polish** |
| — | AC Task 11 (trimmed, D §10), AC 12, AC 13 | — | per AC | per AC |
| W7 | Library, hooks with forced variety, hook picker cards | W6, AC 11, AC 13 | 1 hooks call | unit + **e2e writing-hooks** |
| W8 | Format selection and composer Format menu | W7 | — | unit + **e2e writing-format** |
| W9 | Research engine | W5, W6 | 1 researched turn | unit + **e2e writing-research** |
| W10 | analyzePost and ranked feedback | W6 | 1 analysis | unit + **e2e writing-analyze** |
| W11 | Ideas with source variety, idea picker, learning guard (amends AC 15) | W7, AC 13, AC 15 | 1 ideas turn | unit + **e2e writing-ideas** |
| — | AC Task 14 | W8 | — | per AC |
| W12 | Eval suites, parity fixture, thresholds gate, full-journey e2e | all | full eval + parity | **controller: full suite + eval thresholds** |

---

### Task W1: Post metrics, phone readout, metric baseline

**Kleo evidence:**
- WQ §6 (the measured table; `fmt.py`).
- A1 `mobileFormatting` (`charactersPerLine: 50`, block mix).
- K1/K8/K9 against O1/O2: Orbit's 14 one-line blocks and no lists.

**Files:**
- Create: `packages/agent/src/writing/{measure.ts, measure.test.ts, index.ts}`
- Create: `packages/agent/eval/metrics.ts`, `packages/agent/eval/metrics.test.ts`
- Modify: `packages/agent/eval/run.ts` (flag `--metrics`), `packages/agent/eval/report.ts` (a "Formatting metrics" table between the
  generated markers)
- Modify: `packages/agent/src/client/index.ts`, which re-exports `measurePost` (pure, client-safe)
- Create: `apps/web/src/components/chat/layout-readout.tsx`; modify the document side panel component (Task 9's panel) to render it
  under the post
- Create: `apps/web/e2e/writing-readout.spec.ts`

**Interfaces:**
- **Produces, `writing/measure.ts`:**
  - `CHARS_PER_MOBILE_LINE = 50`, `LINKEDIN_FOLD_CHARS = 210`
  - `type Block = { lines: string[]; kind: "prose" | "bullets" | "numbered"; mobileLines: number; chars: number }`
  - `splitBlocks(text: string): Block[]`. Blocks are separated by blank lines. A block whose lines all start with `-`, `•`, `*` or
    `\d+[.)]` is a list.
  - `mobileLines(line: string): number` uses a greedy word wrap at 50 characters.
  - `type EndingType = "question" | "rule" | "cta" | "statement" | "sources"`
  - `type PostMetrics = { words; chars; lines; blocks; avgCharsPerLine; maxBlockMobileLines; blankLineRatio; oneLineBlockShare;
    hookChars; hookMobileLines; hookEndsBeforeFold: boolean; promiseBeforeFold: boolean; bulletLists; numberedLists; listItems;
    emoji: { count; positions: ("line-start"|"line-end"|"inline")[] }; hashtags; dashes; postscript: boolean; links; numbers: string[];
    ending: EndingType; sentenceWords: { median; max } }`
  - `measurePost(text: string): PostMetrics`
  - `measureCorpus(posts: string[]): LayoutTargets`. It gives p10, median and p90 per numeric metric, shares as percentages, and
    the ending distribution. `LayoutTargets` matches D §2.1; its type is declared here for now and moves to `packages/ai` in W3.
- **Produces, eval:**
  - `metricsFromTranscripts(runFiles: string[]): { id: string; source: "orbit"|"kleo"; metrics: PostMetrics }[]` reads
    `orbit-run-*.json` drafts and the ```` ```post ```` fences in `.recon/benchmark/kleo-quality-lab.md`.
  - `pnpm --filter @brandloop/agent eval --metrics` rewrites the metrics table in `orbit-quality-eval.md`, with no AI calls.
- **Produces, UI:** `LayoutReadout({ text })` shows chips:
  - "Hook · N line(s) on mobile"
  - "N blocks"
  - "List" (shown only when there is a list)
  - "Fits before *see more*" or "Promise is after the fold"
  - Accessible name: `group` "Post layout".

- [ ] **Step 1: Write the failing tests** (fixture posts written for the tests).

```ts
it("groups adjacent lines into one block and spots lists", () => {
  const m = measurePost("Hook line here.\n\nSet-up line:\n- one\n- two\n- three\n\nClose.");
  expect(m.blocks).toBe(3); expect(m.bulletLists).toBe(1); expect(m.listItems).toBe(3); expect(m.oneLineBlockShare).toBeCloseTo(2 / 3);
});
it("wraps at 50 chars for mobile lines", () => { expect(mobileLines("a ".repeat(40).trim())).toBe(2); });
it("measures the hook and the fold", () => { /* 48-char hook → hookMobileLines 1, hookEndsBeforeFold true; 260-char first block → promiseBeforeFold false */ });
it("counts emoji positions, dashes used as punctuation (not hyphens), hashtags, P.S. and links", () => { /* … */ });
it("classifies the ending", () => { /* "…?" question; "Sources: …" sources; "Comment X below" cta */ });
it("computes corpus ranges from p10/median/p90", () => { /* 5 posts → hookChars.low ≤ typical ≤ high */ });
// eval/metrics.test.ts
it("reproduces the WQ §6 shape on a synthetic one-line-per-block post", () => { /* maxBlockMobileLines 1, oneLineBlockShare 1 */ });
```

- [ ] **Step 2: Run them.** `pnpm --filter @brandloop/agent test`. Expected: FAIL.
- [ ] **Step 3: Implement** `measure.ts`, the eval metrics, the report table and `LayoutReadout`.
- [ ] **Step 4: Baseline.** Run `eval --metrics` (no AI) and commit the regenerated table in `orbit-quality-eval.md`. The report
  quotes O1/O2 against K1/K8/K9.
- [ ] **Step 5: e2e `writing-readout.spec.ts`** (mock):
  1. Send "Draft a post about MVP vs POC".
  2. The panel opens with the scripted post.
  3. The "Post layout" group shows "Hook · 1 line on mobile" and "Fits before see more".
  4. Edit the post in the panel to a 300-character first paragraph; the readout updates to "Promise is after the fold".
- [ ] **Step 6: Checks.** Agent test and typecheck; web typecheck and lint.
- [ ] **Step 7: Commit.** `feat(agent): post metrics, phone layout readout and metric baseline`

**Review focus:**
- Emoji regex vs ZWJ sequences: one family emoji counts as 1.
- Hyphens vs dashes: "co-founder" is not a dash.
- No AI calls in `--metrics`.

### Task W2: Hard rules, effective rules, writing checks

**Kleo evidence:**
- A1 `hardRules {forbidEmoji, forbidDashes, bannedPhrases, requireNumerals, forbidPostscript, requireShortBlocks}`.
- A2: the account's dos and don'ts (no em dashes, no emojis, ≤3 lines, no keyword hashtags).
- L2 "prioritize their saved voice" (precedence).
- A1: P.S. overridden despite 76% of the corpus using one.

**Files:**
- Create: `packages/agent/src/writing/{rules.ts, rules.test.ts, lint.ts, lint.test.ts}`
- Modify: `packages/agent/src/specialists/{checks.ts, checks.test.ts}` (add `runWritingChecks`; the 8 existing checks keep their
  ids and order)
- Modify: `packages/agent/src/tools/delegate.ts` (final review includes writing checks), `packages/agent/src/tools/documents.test.ts`
- Modify: the writing-rules section of `apps/web/src/app/(app)/settings/memories/page.tsx` and its component (show "Enforced as
  checks"), via the client-safe `compileHardRules`
- Create: `apps/web/e2e/writing-rules.spec.ts`

**Interfaces:**
- **Produces, `writing/rules.ts`:**
  - `type HardRules = { forbidEmoji: boolean; forbidDashes: boolean; forbidHashtags: boolean; maxHashtags: number; forbidPostscript:
    boolean; maxBlockLines: number | null; bannedPhrases: string[]; forbidRhetoricalOpening: boolean; forbidLinks: boolean;
    spelling: "en-GB" | "en-US" | null; sourcesInPost: boolean }`
  - `DEFAULT_HARD_RULES` (everything off, `maxHashtags: 3`)
  - `compileHardRules(markdown: string): { rules: HardRules; matched: { rule: keyof HardRules; line: string }[] }`. It is
    deterministic, case-insensitive, matches both "No emojis" and "Don't use emoji", and reuses `bannedWordsFromRules`.
  - `type TurnOverrides = { allowEmoji: boolean | null; allowHashtags: boolean | null; allowDashes: boolean | null;
    allowPostscript: boolean | null; allowLinks: boolean | null }`
  - `acceptOverrides(o: TurnOverrides | null, latestUserText: string): Partial<TurnOverrides>`. It keeps only overrides whose
    keyword (emoji, hashtag, dash, P.S., link) appears in the user's text.
  - `type EffectiveRules = { hard: HardRules; targets: LayoutTargets; soft: { source: "turn"|"user"|"style"|"default"; text: string }[];
    dropped: { text: string; reason: string }[]; overrides: Partial<TurnOverrides> }`
  - `resolveRules(input: { userRulesMarkdown: string; style: StyleProfile | null; turn: Partial<TurnOverrides> }): EffectiveRules`.
    It applies D §3.1. Until W3 lands, `style` is always null and `targets` = `DEFAULT_TARGETS`.
- **Produces, `writing/lint.ts`:**
  - `type LintId = "emoji"|"dashes"|"hashtags"|"postscript"|"links"|"banned-phrase"|"rhetorical-opening"|"block-lines"|"hook-length"|
    "fold"|"one-line-blocks"|"list-adjacency"|"post-length"|"list-expected"|"number-provenance"|"date-provenance"|"first-person"|
    "placeholders"|"markdown"`
  - `type Violation = { id: LintId; level: "hard"|"target"|"advice"; detail: string; block: number | null }`
  - `lintPost(text: string, rules: EffectiveRules, ctx: { postType: PostType | null; groundingText: string | null;
    researchDates: string[] | null; personalDetails: "allowed" | "none" }): { metrics: PostMetrics; violations: Violation[] }`.
    The provenance checks are skipped when their context is null. W5 and W9 supply it.
- **Produces, `checks.ts`:** `runWritingChecks(text, rules, ctx): CheckResult[]`. `CheckId` widens to include the `LintId`s that
  aren't already in it. Final review `deterministicChecks = [...runDeterministicChecks(...), ...runWritingChecks(...)]`, and any hard
  failure → `passed: false`.

- [ ] **Step 1: Failing tests.**

```ts
it.each([
  ["- No emojis", "forbidEmoji"], ["- Don't use em dashes", "forbidDashes"], ["- No keyword hashtags", "forbidHashtags"],
  ["- Never add a P.S.", "forbidPostscript"], ["- No walls of text (>3 lines)", "maxBlockLines"], ["- British spelling", "spelling"],
  ["- Never open with a rhetorical question", "forbidRhetoricalOpening"],
])("compiles %s", (line, rule) => { expect(compileHardRules(`## Don't\n${line}`).matched.map((m) => m.rule)).toContain(rule); });
it("leaves unrecognised rules soft", () => { /* "- Sound like a friend" → no matched, appears in resolveRules().soft */ });
it("user hard rules beat style moves", () => {
  const r = resolveRules({ userRulesMarkdown: "- No emojis\n- Never add a P.S.", style: styleWithEmojiCtaAndPs, turn: {} });
  expect(r.dropped.map((d) => d.text).join(" ")).toMatch(/P\.S\./); expect(r.targets.emoji.perPost).toBe(0);
});
it("accepts an override only when the user asked this turn", () => {
  expect(acceptOverrides({ ...none, allowEmoji: true }, "make it punchier")).toEqual({});
  expect(acceptOverrides({ ...none, allowEmoji: true }, "add a couple of emojis this time")).toEqual({ allowEmoji: true });
});
it("lints the user's hard rules as hard, the style's as target", () => { /* em dash with forbidDashes → hard; without → no violation */ });
it("flags a 5-mobile-line block when the rule says ≤3", () => { /* block-lines hard */ });
it("flags every-sentence-its-own-block at ≥6 blocks", () => { /* one-line-blocks target */ });
it("final review fails on a writing check and keeps the 8 old checks first", async () => { /* em-dash post + "No em dashes" rule → passed false; ids[0..7] unchanged */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** rules, lint, `runWritingChecks` and the final-review wiring. In the Memories writing-rules card: a line
  "Enforced as checks: …" listing the matched rules as chips, and "Other rules guide the writer" for the rest.
- [ ] **Step 4: e2e `writing-rules.spec.ts`:**
  1. On Settings → Memories, add "- No emojis" to writing rules and save. The "Enforced as checks" chips include "No emoji".
  2. In a mock chat with the post open, "review it" (mock: `delegateEditing` with a canned post containing an emoji, route
     `[e2e:emoji-draft]`) shows a failed "No emoji" check in the review.
  3. Cleanup restores the rules.
- [ ] **Step 5: Checks**, then **commit** `feat(agent): hard rules, rule precedence and writing checks in the final review`

**Review focus:**
- False positives: "P.S." inside a sentence; "#1" isn't a hashtag; "3–5" isn't a dash.
- Overrides can't come from tool output text.

### Task W3: Style profile schema, storage, original presets

**Kleo evidence:**
- A1, WQ §1.2: the `generationVoice` key set; `voiceAnalysisVersion`, `voiceCorpusHash`, `voiceAnalysisStatus`, `analyzedPostCount`;
  5 `referencePosts`; 8 `finalChecks`.
- WQ §1.1: the spread of layout across presets, from 156 to 1,223 characters and from 1 to 18 blocks.

**Files:**
- Create: `packages/ai/src/schemas/style.ts` (+ export) with `StyleProfileSchema`, `LayoutTargetsSchema`, `PostTypeSchema`,
  `STYLE_SCHEMA_VERSION = 1`; move the `LayoutTargets` type here from W1
- Modify: `packages/db/prisma/schema.prisma`:
  - `VoiceStyle` += `profile Json?`, `profileVersion Int @default(0)`, `status StyleStatus @default(READY)`, `statusDetail String?`,
    `analyzedPostCount Int @default(0)`, `analyzedAt DateTime?`, `corpusHash String?`
  - new `VoiceStyleVersion` (unique on voiceStyleId + version, cascade)
  - new `StyleCorpusPost` (unique on voiceStyleId + hash, cascade; `source CorpusSource`)
  - enums `StyleStatus {PENDING ANALYZING READY FAILED}` and `CorpusSource {PASTE EXPORT ORBIT}`
  - then `migrate dev --name style_profiles`
- Create: `packages/db/src/services/style-profile.ts` + test: `getStyleProfile`, `saveStyleProfile` (version +1, prune to 10),
  `listStyleVersions`, `restoreStyleVersion`, `renderProfileGuide`
- Rewrite: `packages/db/prisma/presets.ts`. Each of the 9 invented personas gets a hand-written profile and 4–5 **original**
  reference posts; `layout` = `measureCorpus(referencePosts)` widened by ±15%. Bump `PRESET_PROFILE_VERSION`. Seeding upserts by
  slug and only when the version is higher.
- Create: `apps/web/src/app/api/voice/[id]/route.ts` (GET a style with its profile summary; profile-scoped or preset)
- Modify: `apps/web/src/components/home/voice-picker.tsx`. This is a **touch point in a UI-owned file, additive only**: a "Details"
  button per option opens `StyleDetailsSheet`, new in `components/chat/style-details-sheet.tsx`
- Create: `apps/web/e2e/writing-presets.spec.ts`

**Interfaces:**
- **Consumes:** W1 `measureCorpus`.
- **Produces:**
  - `StyleProfile` (D §2.1)
  - `getStyleProfile(profileId: string, voiceStyleId: string): Promise<{ style: VoiceStyle; profile: StyleProfile | null }>`, scoped
    to own or preset styles
  - `saveStyleProfile(voiceStyleId: string, profile: StyleProfile, corpusHash: string): Promise<{ version: number }>`
  - `restoreStyleVersion(profileId, voiceStyleId, version): Promise<{ version: number }>`, own styles only
  - `renderProfileGuide(p: StyleProfile): string`: markdown with the voiceTarget, a layout sentence and the do/don't lists. It is
    written to `VoiceStyle.guide` on every save
  - `StyleDetailsSheet` shows the name, tagline, measured layout ("Hooks ~48 characters · 7–10 blocks · lists in 40% of posts") and
    one reference post

- [ ] **Step 1: Failing tests.**

```ts
it("every preset's layout matches its own reference posts", () => {
  for (const p of PRESET_VOICES) { const m = measureCorpus(p.profile.referencePosts.map((r) => r.text)); expect(m.hookChars.typical).toBeGreaterThanOrEqual(p.profile.layout.hookChars.low); /* … */ }
});
it("presets span the layout range", () => { /* min postChars.typical < 400, max > 1,000; at least one with numbered lists ≥50% */ });
it("no preset names a real person or uses a real creator's text", () => { /* REAL_CREATOR_DENYLIST (test-only list incl. Kleo's 9 preset labels) not found in any field */ });
it("saving bumps the version, keeps history and prunes to 10", async () => { /* 12 saves → versions 3..12 listed */ });
it("restores an earlier version as a new version", async () => { /* … */ });
it("another profile's own style is a 404", async () => { /* getStyleProfile across profiles → null */ });   // Review focus 7
it("the schema rejects layout supplied by a model without numbers", () => { /* StyleProfileSchema.safeParse({…layout: {}}) fails */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Write the presets.** Before writing the posts, write one line per persona giving its layout intent; the posts then
  follow it. Keep each post under 1,300 characters. The report lists each persona's measured numbers.
- [ ] **Step 4: Implement** the migration, the service, the seed, the route and the sheet. A second `migrate dev` reports no
  pending changes.
- [ ] **Step 5: e2e `writing-presets.spec.ts`:**
  1. Home → "Change writing style" → "Details" on a preset.
  2. The sheet shows a measured line matching `/Hooks ~\d+ characters/` and a reference post.
  3. Select the preset; the selected-style group shows its name.
  4. Parity: the existing `voice.spec.ts` stays green.
- [ ] **Step 6: Checks** (db, agent, web), then **commit** `feat(db): compiled style profiles with versions, original preset profiles`

**Review focus:**
- Originality of the 45 posts: no paraphrased famous posts.
- The `guide` fallback still renders for rows with `profile = null`.

### Task W4: Own-style extraction (paste and LinkedIn export)

**Kleo evidence:**
- WQ §1.3: `from-url` import, polling every 8 s while pending or analyzing, "unusable until ready".
- A3: `ownStyles: []`.
- A1: profiles compiled from 82–100 posts, with measured blocks.
- D §8: knowledge-base guidance (EV run 3 knowledge-base gains).

**Files:**
- Modify: `schema.prisma` `JobKind` += `STYLE_EXTRACT`, then `migrate dev --name style_extract_job`
- Create: `packages/db/src/services/style-extract.ts` + test. `createOwnVoice` in `voice.ts` becomes a thin wrapper over it, keeping
  its signature for existing callers.
- Create: `packages/db/src/services/linkedin-export.ts` + test: `parseSharesExport(file: Uint8Array, name: string): { posts:
  { text: string; postedAt: Date | null }[]; skipped: number }`. It accepts `Shares.csv` or the export `.zip`, keeps original posts
  with `ShareCommentary` ≥200 characters, keeps the newest 100, and drops reshares and empty rows.
- Modify: `apps/web/src/app/api/voice/own/route.ts`. It accepts `{posts}` JSON or a `multipart/form-data` export file (≤10 MB),
  returns 202 `{jobId, voiceStyleId}`, and sets the style `PENDING`.
- Modify: `voice-picker.tsx` `AddStyleDialog` (touch point, additive): a second tab "Import LinkedIn export". The status line reads
  "Analysing N posts…" until ready, then the details sheet opens.
- Modify: the knowledge-base empty state and Add dialog (`apps/web/src/app/(app)/knowledge-base/…`): the "What makes drafts better"
  list (D §8)
- Modify: `packages/agent/src/mock.ts`: a canned extraction output
- Create: `apps/web/e2e/writing-own-style.spec.ts` and the fixture `apps/web/e2e/fixtures/shares-sample.csv` (invented posts)

**Interfaces:**
- **Consumes:** W1 `measureCorpus`; W3 `saveStyleProfile`, `StyleProfileSchema`; AC `createJob`/`runJob`.
- **Produces:**
  - `ExtractedStyleSchema` (model output; nullable instead of optional): `{ language, voiceTarget, rules, signatureMoves,
    finalChecks, referencePostIndexes: number[], postTypes: PostType[] }`
  - `extractOwnStyle(ai: AiClient, profileId: string, voiceStyleId: string): Promise<{ version: number; skipped: boolean }>`:
    1. Load the corpus.
    2. Hash it; if the hash is unchanged and the style is READY → `skipped`.
    3. Set ANALYZING.
    4. Measure, then make one `extract` call; posts are in `<posts>` tags as data. Retry once on a refusal or a schema miss.
    5. Validate: indexes are in range (3–5 unique); no rule is over 200 characters; no rule mentions a person's name from the
       corpus author line.
    6. Save the profile; set READY with `analyzedPostCount` and `analyzedAt`.
    - On failure: FAILED with `statusDetail`, and the job is FAILED.
  - The `voice/style` memory mirror gets `renderProfileGuide(profile)`, as `createOwnVoice` does today.

- [ ] **Step 1: Failing tests.**

```ts
it("parses a LinkedIn Shares export, newest 100 originals ≥200 chars", () => { /* fixture with reshares/empty rows → counts */ });
it("measures in code and takes only descriptive parts from the model", async () => {
  /* fake ai returns layout-ish junk in voiceTarget; saved profile.layout === measureCorpus(posts) */
});
it("rejects reference indexes out of range and retries once", async () => { /* … then FAILED with statusDetail */ });
it("skips the model when the corpus hash is unchanged", async () => { /* fake ai call count 0 on second run */ });
it("keeps PENDING → ANALYZING → READY and bumps profileVersion", async () => { /* … */ });
it("never reads another profile's corpus", async () => { /* Review focus 7 */ });
it("the canned extraction parses its schema and fails all earlier CANNED schemas", () => { /* mock rule */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the migration, parser, extractor, route, dialog tab and knowledge-base hint.
- [ ] **Step 4: Live smoke** (once, smoke profile): `pnpm --filter @brandloop/agent smoke:style` extracts from 6 invented posts. It
  prints the layout targets, the rule counts and the model id.
- [ ] **Step 5: e2e `writing-own-style.spec.ts`** (mock):
  1. Add your style → paste 5 posts → the status shows "Analysing 5 posts" → then the details sheet shows "Your style" with a
     measured hook line.
  2. A second run uploads `shares-sample.csv` on the import tab and reaches the same ready state.
  3. The knowledge-base empty state shows "What makes drafts better".
  4. Cleanup deletes the own style.
- [ ] **Step 6: Checks**, then **commit** `feat: own writing style compiled from pasted posts or a LinkedIn export`

**Review focus:**
- Zip bombs and huge CSVs: enforce the size cap and a row cap.
- CSV quoting with newlines inside posts.
- PII: the export holds only the user's own posts, and nothing else from the zip is read.

### Task W5: Writer v2: blocks, budgeted style, precedence, no-invention

**Kleo evidence:**
- L1 (asks for missing facts) → L2 (subject-level claims, "prioritize their saved voice").
- K1/K8/K9: adjacent lists and 2–4 line blocks.
- WQ §6: O1's one-line blocks.
- WQ §1.4: the profile shifts structure only on the specialist path.
- A2 "match structure to post type".

**Files:**
- Create: `packages/agent/src/writing/{render.ts, render.test.ts, inject.ts, inject.test.ts}`
- Modify: `packages/agent/src/specialists/{envelope.ts, run.ts, prompts.ts, grounding.ts}` and tests
- Modify: `packages/agent/src/tools/delegate.ts` (new input fields), `packages/agent/src/{types.ts, ledger.ts}` (`missingFacts`),
  `packages/agent/src/prompt.ts` (tool-policy lines), `packages/agent/src/mock.ts`
- Create: `apps/web/e2e/writing-draft.spec.ts`

**Interfaces:**
- **Consumes:** W2 `resolveRules`, `lintPost`; W3 `getStyleProfile`.
- **Produces, payload:** `PostWritingPayload` gains these fields, while `title`, `hook`, `draft` and `clarifyingQuestion` stay, so
  `createDocument` is unchanged:
  - `postType: PostType`
  - `blocks: { kind: "hook"|"prose"|"bullets"|"numbered"|"close"|"sources"; lines: string[] }[]` (1..16)
  - `facts: { text: string; source: "request"|"knowledge"|"memory"|"research"|"general"; ref: string | null }[]` (≤12)
  - `missingFacts: string[]` (≤5)

  The model schema omits `draft`; the server sets `draft = renderBlocks(blocks, style)` and `hook = blocks[0].lines.join("\n")`.
  Options mode (hook variations) is unchanged until W7 replaces it.
- **Produces, rendering and injection:**
  - `renderBlocks(blocks, opts: { bullet: "-" | "•"; numbered: boolean }): string`
  - `renderStyleBlock(profile: StyleProfile | null, rules: EffectiveRules, opts: { postType: PostType | null; budget: number }):
    string`. It applies the D §2.4 priority, stops at the budget, and never includes a `dropped` rule. With no profile it falls back
    to the legacy `guide`.
  - `Grounding` gains `style: { block: string; ref: { voiceStyleId: string; profileVersion: number } | null }` and `rules:
    EffectiveRules`. The `<voice>` tag becomes `<style>`.
- **Produces, tool input:** `delegateWriting` adds `personalDetails: "allowed" | "none"` (default `"allowed"`), `overrides:
  TurnOverrides | null` and `chosenHook: { text: string; spine: Spine | null } | null`; all nullable for OpenAI strict mode.
  `acceptOverrides` is applied with the turn's user text.
- **Produces, ledger:** `ActiveTask.missingFacts: string[]`, `.default([])`. When the envelope has `readiness: "needs-user-input"`,
  the orchestrator, by its tool policy:
  - with AC 13 present: calls `presentOptions` with "Answer these questions" (free input), "Write it without personal details",
    and "Use an example from my knowledge base" (only after a `searchKB` hit)
  - otherwise: asks the questions in one message
- **Produces, provenance:** `lintPost` is now called with `groundingText` = the rendered grounding plus the request, and with
  `personalDetails`. Violations go into the envelope's `findings`. Repair arrives in W6.
- **Writer prompt (`prompts.ts`):** remove "Short paragraphs separated by blank lines" and "no bullet symbols unless the voice uses
  them". Add, in our own words:
  - the block rules (D §4.1)
  - "match structure to the post type"
  - "every number, date and personal experience must come from the request or the grounding; otherwise list it in missingFacts"
  - the `personalDetails: none` mode

- [ ] **Step 1: Failing tests.**

```ts
it("renders list items adjacent and blocks blank-separated", () => {
  expect(renderBlocks([{ kind: "hook", lines: ["Hook."] }, { kind: "bullets", lines: ["a", "b"] }], { bullet: "-", numbered: false })).toBe("Hook.\n\n- a\n- b");
});
it("keeps the style block within budget, hard rules and layout first, references last", () => { /* budget 1,500 → contains hard rules + layout, no reference post */ });
it("never injects a dropped style rule", () => { /* style with P.S. move + user 'Never add a P.S.' → block has no 'P.S.' */ });   // Review focus 3
it("ignores a model override the user didn't ask for", async () => { /* delegateWriting with overrides.allowEmoji true, user text 'draft it' → envelope.findings no override; rules.hard.forbidEmoji true */ });   // Review focus 4
it("server renders draft and hook from blocks", async () => { /* fake ai blocks → envelope.payload.draft === renderBlocks(...) */ });
it("flags an unsupported number and first-person claim", async () => {
  /* grounding without '37%'; blocks contain '37%' and 'I hired' with personalDetails none → findings mention number-provenance and first-person */
});
it("needs-user-input sets ledger missingFacts", async () => { /* … */ });
it("records the style profile version on the envelope", async () => { /* sourceRevisions.style.profileVersion === 2 */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update `SCRIPTED_DRAFT`'s canned payload to blocks, including a two-item bullet list, and keep
  `SCRIPTED_DRAFT` equal to its rendered text so older specs stay valid. Add mock route `[e2e:needs-facts]` → `needs-user-input`
  with two `missingFacts`.
- [ ] **Step 4: Live smoke:** `smoke:draft` (existing) prints the post type, block kinds, `measurePost` summary and findings.
- [ ] **Step 5: e2e `writing-draft.spec.ts`:**
  1. "Draft a post about MVP vs POC" → the panel text contains `"\n- "` list lines with no blank line between them, and the readout
     shows "List".
  2. "Draft a post about my first hire [e2e:needs-facts]" → no document is created, and the reply asks the two questions (or shows
     the picker when AC 13 has landed).
  3. Parity: `chat.spec`, `document-panel.spec` and `proposal.spec` stay green.
- [ ] **Step 6: Checks**, then **commit** `feat(agent): block-structured writer, budgeted style profiles, rule precedence, fact provenance`

**Review focus:**
- OpenAI strict schema: every optional key is nullable, and the `blocks` array has no min/max that breaks the provider.
- Normalising numbers: "40 sample statements" vs "40".

### Task W6: Polish and repair pass

**Kleo evidence:**
- A1 `finalChecks` (8 self-checks).
- L11 proofreadPost and L12 analyzePost run after drafting.
- EV run 4 (c): a 3-sentence paragraph broke Maya's 1–2 sentence rule.
- WQ §8.3: "validate … retry once with the violations listed".

**Files:**
- Create: `packages/agent/src/writing/{polish.ts, polish.test.ts}`
- Modify: `packages/agent/src/tools/{delegate.ts, documents.ts}` (polish after write, `updateDocument` and
  `proposeDocumentEdits`), `packages/agent/src/specialists/editing.ts`, `packages/agent/src/mock.ts`
- Modify: `apps/web/src/components/chat/message-parts.tsx`: the writing step's detail line, "Polished: fixed N layout issues"
  (from the envelope)
- Create: `apps/web/e2e/writing-polish.spec.ts`

**Interfaces:**
- **Produces:**
  - `type RepairLog = { mechanical: string[]; modelRepair: { attempted: boolean; fixed: LintId[] }; lastResort: string[];
    remaining: Violation[] }`
  - `polishDraft(ai: AiClient, input: { blocks; rules: EffectiveRules; lintCtx; request: string; grounding: string; deadline: Date;
    abortSignal?: AbortSignal }): Promise<{ blocks; text: string; log: RepairLog }>`. It follows D §4.3 steps 1–4: at most one
    model repair, skipped when `deadline - now < 20 s`. The last-resort pass covers only emoji, dashes and hashtags.
  - `polishText(...)`: the same for free text (edits). Its model repair goes through `editDocumentText` with the violations as
    `editRequirements`.
  - The envelope's `findings` gain `"Polished: …"` and the remaining target misses (at most 3, in plain words).

- [ ] **Step 1: Failing tests.**

```ts
it("fixes mechanical issues without a model call", async () => { /* trailing '#ai #mvp' with forbidHashtags → removed; ai calls 0 */ });
it("runs one model repair for a 5-line block and re-lints", async () => { /* fake ai returns split blocks → remaining [] ; ai calls 1 */ });
it("never runs a second model repair", async () => { /* repair still violates → calls 1, lastResort applied for emoji */ });   // Review focus 1
it("skips the model repair near the deadline", async () => { /* deadline in 10 s → attempted false */ });
it("updateDocument saves only polished text that passes hard rules", async () => { /* edit introduces em dash with forbidDashes → saved text has none */ });
it("a number the user never gave is repaired or the draft asks for it", async () => { /* number-provenance hard → repair removes it */ });   // Review focus 2
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Mock route `[e2e:emoji-draft]`: the first writer output has an emoji and a 5-line block; the repair
  output is clean.
- [ ] **Step 4: Live smoke** (once): `smoke:draft --seed-violation` asks for a post "with a P.S." while the rules forbid it. It
  prints the `RepairLog` and confirms no P.S. survives.
- [ ] **Step 5: e2e `writing-polish.spec.ts`:**
  1. With "No emojis" in the rules, "Draft a post [e2e:emoji-draft]" → the panel post contains no emoji (checked by regex in the
     page) and no block over 3 mobile lines.
  2. The steps disclosure shows "Polished: fixed 2 layout issues".
  3. Ask "make it shorter" → the saved v2 still passes. Read `GET /api/documents/:id` and check with `measurePost` in the test.
- [ ] **Step 6: Checks**, then **commit** `feat(agent): bounded polish pass with mechanical fixes and one repair`

**Review focus:**
- The last-resort dash replacement must not mangle ranges ("2–3") or hyphenated words.
- Latency: log each draft turn's added milliseconds in the report.

### Task W7: Library, hooks with forced variety, hook picker cards

Runs after AC Task 11 (trimmed) and AC 13.

**Kleo evidence:**
- WQ §2.4: 11 purposes, Proof and Stat evidence-gated, the `spine` contract, the hook picker.
- L8 and B-d: all 5 hooks "curiosity", topic = the raw prompt.
- WQ §2.1–2.2: frameworks, templates, categories.
- EV (e): Orbit's hooks were text only and used jargon.

**Files:**
- Create: `packages/agent/src/library/{purposes.ts, frameworks.ts, categories.ts, templates.ts, index.ts, library.test.ts}`
- Create: `packages/agent/src/tools/hooks.ts` and `hooks.test.ts` (replaces AC Task 11's `generateHooks`)
- Modify: `packages/agent/src/skills/*` from AC 11. The `hooks`, `post-formats` and `frameworks` bodies are rendered from `library/*`,
  with no hand-written duplicates.
- Modify: `packages/agent/src/{tools/index.ts, prompt.ts, mock.ts, client/labels.ts}`
- Create: `apps/web/src/components/chat/hook-cards.tsx`; modify `message-parts.tsx` (replaces AC 11's hooks card)
- Create: `apps/web/e2e/writing-hooks.spec.ts`

**Interfaces:**
- **Produces, library:**
  - `HOOK_PURPOSES: readonly { id: HookPurpose; label; explainer; evidence: "none"|"story"|"number"|"news"; examples: [string, string] }[]`
    (12 entries, D §5)
  - `FRAMEWORKS` (6): `{ id; name; description; plan: BlockPlan }`, where `type BlockPlan = { kind; lines: [number, number]; note }[]`
  - `CATEGORIES` (15); `TEMPLATES` (24): `{ id; category; title; skeleton; why; needs: ("story"|"number"|"news")[] }`
- **Produces, purpose picking:** `pickPurposes(input: { count: number; available: Set<HookPurpose>; recent: HookPurpose[]; seed:
  string }): HookPurpose[]`. It is deterministic for a seed and returns distinct purposes, at least 3 when `count ≥ 3`. It avoids
  `recent` until exhausted.
- **Produces, gates:** `gatePurposes(evidence: { hasStory: boolean; numbers: string[]; hasNews: boolean }, rules: HardRules):
  { available: Set<HookPurpose>; skipped: { purpose; reason }[] }`
- **Produces, tool:** `generateHooks {topic, draftBody: string | null, count: 3..8 = 5, excludeHooks: string[]}` →
  `{ success: true, hooks: { index; text; purpose; purposeLabel; charCount; mobileLines; isPersonal; spine: { claim; mustDeliver;
  bodyShape } }[], skipped }`. One `generate` call writes one hook per assigned purpose. Then:
  - each hook is linted against the hard rules, and must be ≤2 mobile lines and ≤ `targets.hookChars.high + 10`
  - hooks with token Jaccard ≥0.6 against another hook or `excludeHooks` are dropped
  - one regeneration call refills the dropped ones
  - recent purposes are read from this chat's earlier `tool-generateHooks` outputs
  - the topic is the brief's topic, never the raw quick-link prompt (fixes L8)
  - the prompt adds "explain any specialist term for <audience from strategy>" (EV jargon gap)
- **Produces, UI:** `HookCards` shows up to 8 cards, each with a purpose badge, the text, "1 line · 48 chars" and "Use this hook".
  "Use this hook" calls `sendControl({ v: 1, kind: "hook", hookText, toolCallId }, "Use hook N")` (AC 13). In AC 13's `resolveControl`,
  the `hook` case without a document adds the spine to its note, so the writer gets `chosenHook` (W5).

- [ ] **Step 1: Failing tests.**

```ts
it("ships 12 purposes, 6 frameworks, 15 categories, 24 templates with no creator names", () => { /* counts; denylist */ });
it("picks distinct purposes and avoids the last set", () => {
  const a = pickPurposes({ count: 5, available: ALL, recent: [], seed: "s" }); expect(new Set(a).size).toBe(5);
  const b = pickPurposes({ count: 5, available: ALL, recent: a, seed: "s" }); expect(b.filter((p) => a.includes(p))).toHaveLength(0);
});
it("gates proof/number without numbers and question under forbidRhetoricalOpening", () => { /* skipped reasons */ });
it("generateHooks computes counts, drops near-duplicates and refills once", async () => { /* fake ai: 2 near-identical → 1 refill call */ });
it("hook purposes in a set of 5 are ≥4 distinct", async () => { /* … */ });
it("skill bodies are rendered from the library", () => { /* SKILLS.hooks.body contains every purpose label */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The mock chat model gets the keyword "hook variations" → `generateHooks` then text. The canned output
  has 5 hooks with 5 different purposes.
- [ ] **Step 4: Live smoke:** `smoke:hooks` prints the purposes, character counts and skipped gates for "hiring your first engineer".
- [ ] **Step 5: e2e `writing-hooks.spec.ts`:**
  1. "Write 5 hook variations for a post about hiring your first engineer" → 5 cards with 5 distinct purpose badges.
  2. Click "Use this hook" on card 3 → no JSON visible → a draft is created whose first line equals card 3's text.
  3. With a post open: "Use this hook" swaps the opening, and the panel version goes up by 1.
- [ ] **Step 6: Checks**, then **commit** `feat(agent): hook and format library, varied hooks, hook picker cards`

**Review focus:**
- The skill-body diff vs AC 11 (one source).
- No purpose label that implies a fact the user didn't supply.

### Task W8: Format selection and the composer Format menu

**Kleo evidence:**
- WQ §2.1–2.2: `selectedFrameworkId` and `selectedTemplateId` sent from the composer; slot skeletons.
- A2 "match structure to post type".
- K2: a numbered list under a colon set-up, following the style's 70% numbered share.

**Files:**
- Create: `packages/agent/src/writing/{format.ts, format.test.ts}`
- Modify: `packages/agent/src/types.ts` (`ChatRequestSchema.selectedFormatId: string | null`, default null, validated against
  `FRAMEWORKS` + `TEMPLATES` ids → 400 `bad_request`), `packages/agent/src/{turn.ts, context.ts, prompt.ts, tools/delegate.ts}`
- Create: `apps/web/src/components/chat/format-menu.tsx`; modify `chat-composer.tsx` and `use-chat-session.ts`
- Create: `apps/web/e2e/writing-format.spec.ts`

**Interfaces:**
- **Produces:**
  - `selectFormat(input: { selectedFormatId: string | null; postType: PostType | null; style: StyleProfile | null; request: string }):
    { id: string | null; plan: BlockPlan; source: "picked"|"post-type"|"style"|"default" }`
  - `renderFormatBlock(f): string` (≤1,200 chars) for the writer's `<format>` block
  - `lintPost`'s `list-expected` uses the plan, so a plan with a list block makes a missing list a target violation
- **Produces, UI:** `FormatMenu` lists "Let Orbit choose" (default), the 6 frameworks and the templates grouped by category, with
  search. The pick shows as a removable chip in the composer and is sent as `selectedFormatId` on the next message only.

- [ ] **Step 1: Failing tests.** A picked format wins; framework/how-to → a plan with a list; "short" → ≤4 blocks; an unknown id →
  400; a template's unfilled slots fail the placeholders check.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** The mock writer route `[format:numbered]` returns numbered blocks.
- [ ] **Step 4: e2e `writing-format.spec.ts`:**
  1. Open the Format menu, pick "Myth, truth, proof" → a chip appears.
  2. Send "Draft a post about MVP myths" → the request body carries `selectedFormatId` (asserted via `page.on("request")`), the
     panel post has a numbered list, and the chip clears after sending.
- [ ] **Step 5: Checks**, then **commit** `feat: format selection and composer Format menu`

**Review focus:**
- Coordinate the composer touch point with AC 14's flow menu: one row, no restyling.

### Task W9: Research engine

**Kleo evidence:**
- L5:
  - 3 server prefetch searches with explicit date windows
  - `site:` follow-ups with `recency: week`
  - the freshness contract
  - dated primary sources, corroboration and exclusions
  - `Sources:` in the post
  - 22 source rows
  - the window widened to the whole month
- L13: facets taken from chat topics, and old results reused.
- WQ §4.2: the feed is never used.

**Files:**
- Create: `packages/agent/src/research/{window.ts, timely.ts, provider.ts, openai.ts, perplexity.ts, normalize.ts, brief.ts}` and
  `research.test.ts`
- Modify: `schema.prisma`: `ResearchBrief {id, profileId, chatId, topic, windowStart, windowEnd, provider, items Json, exclusions
  Json, searchCount Int, createdAt}` with indexes `[profileId, createdAt]` and `[chatId]`, cascading on profile and chat. Then
  `migrate dev --name research_briefs`. Create `packages/db/src/services/research.ts` + test.
- Create: `packages/agent/src/tools/research.ts` (`researchTopic`); modify `tools/index.ts`. The provider `web_search` is removed
  from `buildTools` once this lands; update `prompt.ts` and the AC tests that expect it.
- Modify: `packages/agent/src/turn.ts` (prefetch before the first step; `data-research` part), `specialists/grounding.ts`
  (`<research>` block), `writing/render.ts` (the server-rendered `sources` block), `writing/lint.ts` (date provenance with research
  dates), `apps/web/src/lib/chat-deps.ts` (provider selection), `packages/agent/src/mock.ts` (`fakeResearchProvider` with a frozen
  fixture)
- Create: `apps/web/src/components/chat/research-step.tsx` (the window label, dated items, exclusions and source rows); modify
  `message-parts.tsx`
- Create: `apps/web/e2e/writing-research.spec.ts`

**Interfaces:**
- **Produces, window and trigger:**
  - `resolveWindow(text: string, now: Date, timezone: string): { start: string; end: string; label: string } | null` (D §6.1). "This
    week" is Monday to today in the user's timezone, and is never widened.
  - `isTimely(text: string): { timely: boolean; reason: string | null }`
- **Produces, provider:**
  - `interface ResearchProvider { id: "openai" | "perplexity"; search(q: { query: string; window; maxResults: number }, signal:
    AbortSignal): Promise<{ answer: string; citations: { url: string; title: string; snippet: string | null }[] }> }`
  - `openaiResearch(model: LanguageModel, webSearch: Tool): ResearchProvider`
  - `perplexityResearch(apiKey: string, fetch: typeof globalThis.fetch): ResearchProvider`
  - `selectResearchProvider(env): ResearchProvider | null`
- **Produces, normalising and briefs:**
  - `normalizeResearch(ai: AiClient, raw[], window): { items: ResearchItem[]; exclusions: Exclusion[] }`. Its URL check drops any
    URL not among the provider's citations, and its date check moves items outside the window to exclusions.
  - `buildFacetQueries(topic: string, window, strategy: { audience: string | null; pillars: string[] }): string[]` (3 queries, each
    with the window in words plus the freshness contract)
  - `prefetchResearch(ctx, userText): Promise<ResearchBrief | null>`. It runs in parallel with a 25 s wall clock, reuses a fresh
    brief for the same chat, window and topic (<24 h), and enforces the per-profile daily cap.
  - `researchTopic {query: string; window: "today"|"this-week"|"last-7-days"|"this-month"|null; site: string | null}`, at most 2
    per turn → `{ success: true, items, exclusions, window }` or `Refused: today's research limit is reached.`
  - `renderSourcesBlock(items: ResearchItem[], cited: string[]): Block`. It is used only when `hard.sourcesInPost` is set or the
    user asked this turn; otherwise the reply lists the sources.

- [ ] **Step 1: Failing tests.**

```ts
it("resolves 'this week' to Monday..today in the user's timezone and never widens", () => {
  expect(resolveWindow("what happened this week", new Date("2026-10-22T09:00:00Z"), "Europe/Lisbon")).toMatchObject({ start: "2026-10-19", end: "2026-10-22" });
});
it("isTimely fires on news phrasing and not on evergreen topics", () => { /* "MVP vs POC" false; "this week's AI news" true */ });
it("drops invented URLs and moves out-of-window items to exclusions", async () => {   // Review focus 5
  /* fake normalize returns an item with url not in citations + one dated 2026-10-15 → items 1, exclusions 2 with reasons */
});
it("prefetch runs 3 facet queries from the strategy, not the chat", async () => { /* queries include pillar text */ });
it("reuses a fresh brief and enforces the daily cap", async () => { /* second call → provider calls 0; 41st search → Refused */ });
it("date provenance fails a post naming a date no item has", () => { /* … */ });
it("perplexity adapter maps the window to its date filters (fake fetch)", async () => { /* request body has the filters */ });
it("web search off: no prefetch and the prompt says so", async () => { /* … */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The mock gets the keyword "this week" → prefetch through `fakeResearchProvider`:
  - 2 in-window items (Oct 20, Oct 21)
  - 1 excluded (Oct 15)
  - one invented URL that gets dropped
  - then `delegateWriting` → text
- [ ] **Step 4: Live smoke** (once): `smoke:research` runs "What happened in AI this week that matters for small agencies?" with web
  search on. It prints the window, item dates, exclusion reasons, the provider, the search count, tokens and latency. It never
  prints a key.
- [ ] **Step 5: e2e `writing-research.spec.ts`** (mock, web search toggle on):
  1. Send the request above → a research step shows "19–22 Oct", 2 dated items, and "Excluded: 1 outside the window".
  2. The draft names "October 21" and has no out-of-window item.
  3. The sources appear in the reply, not in the post.
  4. Toggle web search off and repeat → the reply says web search is off, and no research step shows.
- [ ] **Step 6: Checks**, then **commit** `feat(agent): dated research with a freshness window, sources and exclusions`

**Review focus:**
- Timezone edges (Sunday night in Lisbon, Monday in UTC).
- Prompt injection inside search snippets: wrapped as data and never followed.
- Cost logging.

### Task W10: analyzePost and ranked feedback

**Kleo evidence:**
- L12: analyzePost's 5 fixed criteria (Flow, Connection, Hook, Grammar, Accuracy).
- L11: proofreadPost `{issues, claims, searchesRun}`.
- L9/L10: rated the wrong draft, then the scorecard turn failed.
- EV (f): Orbit put a nitpick in the top three.

**Files:**
- Create: `packages/agent/src/tools/analyze.ts`, `analyze.test.ts` (replaces AC 11's `analyzePost`)
- Modify: `packages/agent/src/{prompt.ts (feedback policy), tools/index.ts, mock.ts, client/labels.ts}`
- Create: `apps/web/src/components/chat/analysis-card.tsx`; modify `message-parts.tsx`
- Create: `apps/web/e2e/writing-analyze.spec.ts`

**Interfaces:**
- **Produces:** `analyzePost {postContent: string | null}`. It defaults to the open document; with neither it returns `Failed: …`
  as in AC 11. The output:

  ```
  { success: true, source: "open-post" | "pasted",
    criteria: { id: "hook"|"fold-layout"|"flow"|"voice-rules"|"accuracy"|"audience-clarity"; rating: "strong"|"good"|"needs-work"; note: string }[],
    topFixes: { quote: string; problem: string; rewrite: string; impact: "rule"|"reach"|"clarity"|"accuracy" }[],
    optional: string[],
    checks: CheckResult[] }
  ```

  - `topFixes` holds at most 3.
  - Ranking happens on the server and is deterministic: hard violations first, then fold or hook, then structure, then wording.
  - A model issue whose `impact` the model marks `"nit"` goes to `optional`, never into `topFixes`.
  - `fold-layout` and `voice-rules` ratings are computed from `lintPost` and `measurePost`.
  - `audience-clarity` flags unexplained specialist terms for the strategy's audience.
  - `source` makes clear which post was analysed (fixes L9).

- [ ] **Step 1: Failing tests.**
  - A seeded hard violation ranks first.
  - A nit never enters `topFixes` (Review: EV (f)).
  - The ratings for fold and rules come from code even when the model disagrees.
  - Pasted text wins over the open post when given.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** The mock keyword is "analyze".
- [ ] **Step 4: Live smoke:** analyse EV's (c) draft and print the ranking.
- [ ] **Step 5: e2e `writing-analyze.spec.ts`:** paste a draft with an em dash under "No em dashes", plus a cosmetic issue, and send
  "Analyze this" → the analysis card shows 6 criteria. The first top fix quotes the dash line. "Optional" is collapsed and holds the
  cosmetic note.
- [ ] **Step 6: Checks**, then **commit** `feat(agent): analyzePost with code-backed criteria and ranked fixes`

### Task W11: Ideas with source variety, idea picker, learning guard (amends AC 15)

**Kleo evidence:**
- L13: trends from chat topics.
- A7/WQ §5: Kleo stored a false fact from task framing.
- EV (b): ideas took 70 s and reused one client case 3 times.
- Q1 "ideas need their own path".

**Files:**
- Create: `packages/agent/src/writing/{ideas.ts, ideas.test.ts}`
- Modify: AC 11's `delegateStrategy` runner (source assignment before generation, the `extract` model, picker output),
  `apps/web/src/lib/ideas-generate.ts` (same `assignSources` for the Ideas screen), `packages/agent/src/prompt.ts` (ideas →
  `delegateStrategy`, never `delegateWriting`)
- Modify (amends AC 15): `packages/agent/src/learn.ts` → `shouldLearn` gains `isWritingRequest: boolean` and
  `statesFirstPersonFacts: boolean`; plus `learn.test.ts`
- Create: `apps/web/e2e/writing-ideas.spec.ts`

**Interfaces:**
- **Produces:**
  - `assignSources(input: { count: number; knowledge: { id; title }[]; stories: string[]; pillars: string[]; research: ResearchItem[];
    recentTitles: string[] }): { slot: number; source: { kind: "knowledge"|"story"|"pillar"|"research"; ref: string } }[]`. Each
    source is used at most once per set when there are enough; at least 3 distinct kinds when available.
  - Each idea gets a hook purpose from `pickPurposes`.
  - `isWritingRequest(text: string): boolean` matches draft/write/rewrite/hooks/ideas/post-about phrasing.
  - `statesFirstPersonFacts(text: string): boolean` matches "I am / I run / I've / my company / we …" as statements, not requests.
  - Learning is excluded when `isWritingRequest && !statesFirstPersonFacts`.
  - The ideas turn ends on `presentOptions`: up to 6 ideas. Picking one sends "Draft idea N" (AC 13 control `options`) → the writer.

- [ ] **Step 1: Failing tests.**
  - 5 ideas use ≥4 distinct sources when the fixture has 2 knowledge items, 2 stories and 3 pillars.
  - No source is reused while an unused one exists.
  - "Skip personal details. Write it as practical lessons for founders hiring their first engineer" → `shouldLearn` false, and no
    `MEMORY_LEARN` job (Review focus 6).
  - "I run a 6-person studio, write a post about it" → learns.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** The mock keyword "ideas" → `delegateStrategy` → `presentOptions` with 5
  ideas whose source badges differ.
- [ ] **Step 4: Live smoke:** one ideas turn on the eval fixture; print the latency (target ≤25 s) and the source kinds.
- [ ] **Step 5: e2e `writing-ideas.spec.ts`:**
  1. "Give me 5 post ideas for this week" → a picker with 5 ideas and distinct source badges.
  2. Pick idea 2 → a draft is created.
  3. Settings → Memories shows no new fact after "Skip personal details…" (read `GET /api/user-memory` version before and after).
- [ ] **Step 6: Checks**, then **commit** `feat(agent): varied idea sources, idea picker, learning guard for writing requests`

### Task W12: Eval suites, parity fixture, thresholds gate, full-journey e2e

**Kleo evidence:**
- WQ §8.11 (the eval plan).
- EV caveat: different profiles inflated the 6–0.
- K1–K9: the opposite side on the same profile.
- D §7 thresholds.

**Files:**
- Create: `packages/agent/eval/{thresholds.ts, suites/layout.ts, suites/presets.ts, suites/research.ts, suites/hooks.ts,
  suites/privacy.ts, suites/feedback.ts, parity.ts}` and `eval/suites.test.ts`
- Modify: `packages/agent/eval/{run.ts (flags --suite <name>, --parity), report.ts, fixture.ts}`. The Maya fixture gets an own style
  compiled from 6 invented posts at seed time, with one extraction call.
- Create: `packages/agent/scripts/capture-kleo-profile.md`, an instruction note **for the user**: run the read-only GETs (A2
  `/api/user-writing-style`, A7 `/api/user-memory`) in their signed-in Kleo tab and save the JSON to
  `.recon/benchmark/kleo-profile.json`. No writes.
- Create: `apps/web/e2e/writing-engine.spec.ts` (the full journey)
- Modify: `docs/research/orbit-quality-eval.md` (the method section and the new tables between the markers)

**Interfaces:**
- **Produces:**
  - `THRESHOLDS`: the D §7 table as data, each entry `{ id, describe, measure(results): number, target: { op: "<="|">="|"=="; value },
    blocking: boolean }`
  - `checkThresholds(results): { passed: boolean; rows: { id; value; target; passed; blocking }[] }`
  - `loadParityProfile(path: string): ParityProfile | null` maps the Kleo JSON to Orbit memory keys: writing rules from the dos and
    don'ts, deduped (A2 repeats each rule), and the `voice_style`, identity, topics and strategy sections. It returns null when the
    file is missing; the suite is then skipped with a note.
  - **Parity prompts:** the L1, L2, L3, L5, L6, L7 and L8 requests. L5 can't give both sides the same facts, because Kleo's
    K4 used its own research from that day. So L5 is judged on structure, dating and sourcing only, and the report lists this as a
    caveat. The pairwise judge compares against K1–K9 read from `.recon` at runtime, and is
    told to ignore likeness to any named style.
  - The report gains "Formatting metrics", "Threshold gate" and "Parity (same profile)" tables.

- [ ] **Step 1: Failing tests** (no AI): the thresholds compute from canned results, and a blocking failure fails `checkThresholds`;
  `loadParityProfile` dedupes "- X:" / "- Do: X" pairs; parity is skipped without the file; the privacy suite asserts the memory
  version is unchanged.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.**
- [ ] **Step 4: Live runs** (user-approved budget, D §9.4):
  1. `eval` (6 prompts) + `--suite presets,hooks,research,privacy,feedback`, once.
  2. `--parity` once, if the file exists.
  3. Rejudge only when the judge changes.
  - Report: every threshold row, the latency p50, the tokens, and the before (run 4) and after numbers.
- [ ] **Step 5: e2e `writing-engine.spec.ts`** (mock, the full journey):
  1. Pick a preset (details sheet).
  2. Draft → the readout shows a list and a fold pass.
  3. Hook variations → 5 distinct badges → use one.
  4. "Analyze this" → the card shows.
  5. Research turn → dated items.
  6. Final review → all hard checks pass.
  - The controller also runs the full e2e suite. The parity specs `shell`, `memories`, `strategy`, `voice`, `chat`,
    `document-panel`, `proposal` and `ideas` must stay green.
- [ ] **Step 6: Gate.** Every blocking threshold passes: zero hard violations, provenance at 100%, hooks ≥4 distinct, 0 out-of-window
  items. Non-blocking misses are listed with a follow-up.
- [ ] **Step 7: Commit.** `test(agent): writing-engine eval suites, parity fixture and threshold gate`

---

## Overlap with AC Tasks 11–15 (decisions to apply to `docs/features/02-ai-core/plan.md`)

- **AC 11:**
  - Keep: `delegateIdentity`, `delegateStrategy`, `runSkill` and the skills index, and `source-url` persistence.
  - **Remove from 11:** `generateHooks` (→ W7), `analyzePost` (→ W10), and the web-search wiring step and `smoke:web`. Web search
    becomes `researchTopic` and the prefetch in W9; the `webSearchTool` dependency stays until W9 removes it.
  - Skill bodies for `hooks`, `post-formats` and `frameworks` start as AC 11 text and are replaced by library renders in W7.
- **AC 12:** unchanged. Flow routes name `generateHooks`, `analyzePost` and `researchTopic`. The "only routes to tools that exist"
  test runs again after W7, W9 and W10.
- **AC 13:** unchanged, and it must land before W7 and W11. W5's missing-facts picker uses it when present.
- **AC 14:** unchanged. It shares the composer row with W8's Format menu, so land W8 first.
- **AC 15:** amended by W11 (`shouldLearn` gains the writing-request guard; the privacy test is added). Its other parts are unchanged.

## Self-review (done while writing)

- Every D section maps to a task:
  - §2 → W3, W4
  - §3 → W2, W5
  - §4 → W1, W2, W5, W6
  - §5 → W7, W8
  - §6 → W9
  - §7 → W1, W12
  - §8 → W4
  - §10 → the overlap section
- Migrations: 3, in sequence (W3, W4, W9).
- Each task has a Kleo evidence line, failing tests first, an e2e spec under `apps/web/e2e/writing-*.spec.ts`, and checks and a
  commit.
- No task needs a live call in tests. Live smokes are one per AI task, on the smoke profile.
- Ambiguities left to the user are listed in D §9: fold constants, parity consent, the sources default and the live budget.
