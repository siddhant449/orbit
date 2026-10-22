/**
 * Orbit chat quality eval. NOT run by any test suite: it seeds a throwaway eval user, runs the benchmark prompts as
 * real chat turns through runChatTurn (the app's path, real OpenAI), judges every reply, writes a transcript and
 * the report, then deletes the eval user and checks nothing is left.
 *
 *   pnpm --filter @brandloop/agent eval            # full run
 *   pnpm --filter @brandloop/agent eval --metrics  # only rewrite the formatting-metrics table (no AI, no database)
 *   pnpm --filter @brandloop/agent eval --report   # only rebuild docs/research/orbit-quality-eval.md from saved runs
 *   pnpm --filter @brandloop/agent eval --rejudge <n>   # re-score a saved run with the current judge
 *
 * Reads OPENAI_API_KEY at runtime (the script loads the repo .env) and never prints it. No web search, no title
 * calls, never Deepgram. Knowledge chunks are embedded (as the app's ingest does), so retrieval matches production.
 */
import "@brandloop/db/use-test-db";
import { createAiClient, createEmbedder, getModel, resolveModel, type AiClient, type ModelAlias } from "@brandloop/ai";
import { getChat, getChatDocument, listMessages, prisma, strategyThemesMarkdown } from "@brandloop/db";
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunRegistry } from "../src/registry";
import { bannedWordsFromRules, runDeterministicChecks } from "../src/specialists/checks";
import { runChatTurn } from "../src/turn";
import { EVAL_FIXTURE, evalRowsLeft, removeEvalUser, seedEvalProfile } from "./fixture";
import { DRAFT_FROM_C, EVAL_CHATS } from "./prompts";
import { reportMarkdown, spliceGenerated, transcriptMarkdown, type DocSnapshot, type RunRecord, type TurnRecord } from "./report";
import { aggregate, blindOrder, judgePairwise, kleoDraft, judgeTurn, parseKleoReplies, tallyPairwise, unblind, type PairwiseWinner } from "./rubric";
import { metricsFromTranscripts, metricsTableMarkdown, spliceMetrics } from "./metrics";
import { summarizeParts } from "./transcript";

const here = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(here, "../../..");
/** .recon lives in the main checkout, shared by every worktree. */
const BENCH_DIR = process.env.EVAL_BENCH_DIR ?? resolve(worktree, "../../.recon/benchmark");
const REPORT = join(worktree, "docs/research/orbit-quality-eval.md");
const KLEO_FILE = join(BENCH_DIR, "kleo-replies.md");

const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

type Tokens = { input: number; output: number };
const zero = (): Tokens => ({ input: 0, output: 0 });

function addUsage(into: Tokens, usage: unknown) {
  const u = usage as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  const n = (v: unknown) => (typeof v === "number" ? v : typeof (v as { total?: unknown })?.total === "number" ? (v as { total: number }).total : 0);
  into.input += n(u?.inputTokens);
  into.output += n(u?.outputTokens);
}

/** Counts tokens into `meter.current` for every generate and stream call of the wrapped model. */
function metered(model: LanguageModel, meter: { current: Tokens }): LanguageModel {
  const middleware: LanguageModelMiddleware = {
    wrapGenerate: async ({ doGenerate }) => {
      const r = await doGenerate();
      addUsage(meter.current, r.usage);
      return r;
    },
    wrapStream: async ({ doStream }) => {
      const r = await doStream();
      const stream = r.stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if ((chunk as { type?: string }).type === "finish") addUsage(meter.current, (chunk as { usage?: unknown }).usage);
            controller.enqueue(chunk);
          },
        }),
      );
      return { ...r, stream };
    },
  };
  return wrapLanguageModel({ model: model as Parameters<typeof wrapLanguageModel>[0]["model"], middleware });
}

function fixtureText(today: Date): string {
  const f = EVAL_FIXTURE;
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: f.profile.timezone }).format(today);
  return [
    `Today for the user: ${day}.`,
    `Profile: ${f.profile.fullName}, ${f.profile.jobTitle} at ${f.profile.company}; language ${f.profile.language}; timezone ${f.profile.timezone}.`,
    ...Object.entries(f.memory).map(([k, v]) => `## memory ${k}.md\n${v}`),
    `## strategy (goal: ${f.strategy.goal})\n${strategyThemesMarkdown(f.strategy)}\n\nFormats: ${f.strategy.contentFormats.map((x) => `${x.format} ${x.perWeek}/week`).join(", ")}`,
    `## selected writing style "${f.writingStyle.name}"\n${f.writingStyle.guide}`,
    ...f.knowledge.map((k) => `## knowledge item "${k.title}"\n${k.content}`),
  ].join("\n\n");
}

function nextRunNumber(): number {
  if (!existsSync(BENCH_DIR)) return 1;
  const nums = readdirSync(BENCH_DIR)
    .map((n) => /^orbit-run-(\d+)\.json$/.exec(n)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function loadRuns(): RunRecord[] {
  if (!existsSync(BENCH_DIR)) return [];
  return readdirSync(BENCH_DIR)
    .filter((n) => /^orbit-run-\d+\.json$/.test(n))
    .map((n) => JSON.parse(readFileSync(join(BENCH_DIR, n), "utf8")) as RunRecord)
    .sort((a, b) => a.run - b.run);
}

const REPORT_HEADER = `# Orbit chat quality eval

How good Orbit's chat agent is on the six benchmark prompts, judged by a rubric (gpt-6.1-sol via AiClient.json) and,
when Kleo's replies to the same prompts are captured, a blind pairwise comparison. Generated by
\`pnpm --filter @brandloop/agent eval\` (packages/agent/eval); the block between the markers is rewritten on each run.`;

function writeReport() {
  const existing = existsSync(REPORT) ? readFileSync(REPORT, "utf8") : null;
  writeFileSync(REPORT, spliceGenerated(existing, reportMarkdown(loadRuns()), REPORT_HEADER));
  console.log(`report: ${REPORT}`);
}

const docSnap = (d: { title: string; version: number; text: string } | null): DocSnapshot | null =>
  d ? { title: d.title, version: d.version, text: d.text } : null;

async function waitForRun(profileId: string, chatId: string) {
  for (let i = 0; i < 600 && (await getChat(profileId, chatId))?.activeRunId; i++) await new Promise((r) => setTimeout(r, 100));
}

/** Rubric-judges every turn (with the conversation so far in its chat) and, when Kleo's replies exist, runs the blind pairwise. */
async function judgeTurns(judge: AiClient, turns: TurnRecord[], run: number, startedAt: string): Promise<RunRecord["pairwise"]> {
  // Judge every turn with the conversation so far in its chat.
  const fixture = fixtureText(new Date(startedAt));
  for (const t of turns) {
    const earlier = turns.filter((o) => o.chat === t.chat && turns.indexOf(o) < turns.indexOf(t));
    const conversation = earlier
      .map((o) => `User: ${o.prompt}\nAssistant: ${o.text}${o.documentChange !== "none" && o.documentAfter ? `\n[open post after this turn, v${o.documentAfter.version}]\n${o.documentAfter.text}` : ""}`)
      .join("\n\n");
    const turnText = [
      `User message:\n${t.prompt}`,
      `Tool trace (in order):\n${t.tools.map((c, i) => `${i + 1}. ${c.name} [${c.ok ? "ok" : "failed"}] input=${c.input}\n   output=${c.output}`).join("\n") || "(no tools called)"}`,
      t.documentBefore ? `Open post before this turn (v${t.documentBefore.version}):\n${t.documentBefore.text}` : "No post was open before this turn.",
      t.documentChange !== "none" && t.documentAfter
        ? `Post ${t.documentChange} by this turn (v${t.documentAfter.version}, ${t.documentAfter.text.split(/\s+/).filter(Boolean).length} words):\n${t.documentAfter.text}`
        : "No post was created or changed in this turn.",
      t.checks.length ? `Server checks on the post: ${t.checks.map((c) => `${c.id} ${c.passed ? "ok" : "FAILED"}`).join(", ")}` : "",
      `Assistant's chat reply:\n${t.text || "(empty)"}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      t.verdict = await judgeTurn(judge, { fixture, conversation, turn: turnText });
    } catch (err) {
      console.error(`judge failed on (${t.promptId}): ${redact(err instanceof Error ? err.message : String(err))}`);
    }
  }

  // Blind pairwise against Kleo, when its replies were captured.
  let pairwise: RunRecord["pairwise"] = null;
  if (existsSync(KLEO_FILE)) {
    const kleo = parseKleoReplies(readFileSync(KLEO_FILE, "utf8"));
    const winners: PairwiseWinner[] = [];
    for (const t of turns) {
      const k = kleo[t.promptId];
      if (!k) continue;
      // A prompt that pastes an earlier draft (f) gave each assistant its own draft: show each reply with the draft it got.
      const template = EVAL_CHATS.flatMap((c) => c.prompts).find((p) => p.id === t.promptId)?.text ?? t.prompt;
      const pasted = template.includes(DRAFT_FROM_C);
      const request = pasted ? template.replace(DRAFT_FROM_C, "(each assistant was given its own earlier draft; it is quoted at the top of its reply)") : t.prompt;
      const orbitDraft = pasted ? (t.documentBefore?.text ?? t.prompt.slice(template.indexOf(DRAFT_FROM_C))) : null;
      const kleoPasted = pasted ? kleoDraft(kleo.c ?? "") : null;
      const orbit = [
        orbitDraft ? `[Draft the user pasted]\n${orbitDraft}\n[Reply]` : "",
        t.text,
        t.documentChange !== "none" && t.documentAfter ? `[Post in the side panel]\n${t.documentAfter.text}` : "",
      ].filter(Boolean).join("\n\n");
      const kleoReply = kleoPasted ? `[Draft the user pasted]\n${kleoPasted}\n[Reply]\n\n${k}` : k;
      const order = blindOrder(t.promptId, run);
      const [a, b] = order === "orbit-first" ? [orbit, kleoReply] : [kleoReply, orbit];
      try {
        const result = await judgePairwise(judge, { request, a, b });
        const winner = unblind(result.winner, order);
        t.pairwise = { order, result, winner };
        winners.push(winner);
      } catch (err) {
        console.error(`pairwise failed on (${t.promptId}): ${redact(err instanceof Error ? err.message : String(err))}`);
      }
    }
    if (winners.length) pairwise = tallyPairwise(winners);
  } else {
    console.log("kleo-replies.md not found; skipping the pairwise comparison.");
  }

  return pairwise;
}

/** `--metrics`: rewrites the formatting-metrics table from saved transcripts and Kleo's lab file. No AI, no database. */
function writeMetrics() {
  const runs = existsSync(BENCH_DIR)
    ? readdirSync(BENCH_DIR).filter((n) => /^orbit-run-\d+\.json$/.test(n)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))
    : [];
  // Kleo's drafts plus the newest Orbit run, so the table stays one screen.
  const rows = metricsFromTranscripts(runs.slice(-1).map((n) => join(BENCH_DIR, n)), join(BENCH_DIR, "kleo-quality-lab.md"));
  const existing = existsSync(REPORT) ? readFileSync(REPORT, "utf8") : REPORT_HEADER;
  writeFileSync(REPORT, spliceMetrics(existing, metricsTableMarkdown(rows)));
  console.log(`metrics: ${rows.length} drafts -> ${REPORT}`);
}

async function main() {
  if (process.argv.includes("--metrics")) {
    writeMetrics();
    return;
  }
  if (process.argv.includes("--report")) {
    writeReport();
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set; nothing to evaluate.");
    process.exit(1);
  }
  const rejudge = process.argv.indexOf("--rejudge");
  if (rejudge !== -1) {
    // Re-score a saved run with the current judge, without running any chat turns.
    const n = Number(process.argv[rejudge + 1]);
    const file = join(BENCH_DIR, `orbit-run-${n}.json`);
    const record = JSON.parse(readFileSync(file, "utf8")) as RunRecord;
    for (const t of record.turns) {
      t.verdict = null;
      t.pairwise = null;
    }
    record.pairwise = await judgeTurns(createAiClient(apiKey), record.turns, record.run, record.startedAt);
    record.aggregate = aggregate(record.turns.filter((t) => t.verdict).map((t) => ({ promptId: t.promptId, verdict: t.verdict! })));
    writeFileSync(file, JSON.stringify(record, null, 2));
    writeFileSync(join(BENCH_DIR, `orbit-run-${n}.md`), transcriptMarkdown(record));
    writeReport();
    console.log(`rejudged run ${n}: overall ${record.aggregate.overall?.toFixed(2) ?? "–"}`);
    return;
  }
  mkdirSync(BENCH_DIR, { recursive: true });
  const run = nextRunNumber();
  const startedAt = new Date().toISOString();
  console.log(`eval run ${run}: generate ${resolveModel("generate")}, extract ${resolveModel("extract")}`);

  const orchestratorMeter = { current: zero() };
  const specialistMeter = { current: zero() };
  const deps = {
    model: metered(getModel("generate", apiKey), orchestratorMeter),
    ai: createAiClient(apiKey, { model: (alias: ModelAlias) => metered(getModel(alias, apiKey), specialistMeter) }),
    embedder: createEmbedder(apiKey),
    registry: createRunRegistry(),
    after: () => {},
    webSearchTool: null,
  };
  const judge = createAiClient(apiKey);

  const turns: TurnRecord[] = [];
  let cleanup: Record<string, number> = {};
  let profileId = "";
  let failed = false;
  try {
    const seeded = await seedEvalProfile({ embedder: deps.embedder });
    profileId = seeded.profileId;
    const caller = { userId: seeded.userId, profileId };
    let draftFromC = "";

    for (const chat of EVAL_CHATS) {
      const chatId = randomUUID();
      for (const p of chat.prompts) {
        const text = p.text.replace(DRAFT_FROM_C, draftFromC || "(prompt c produced no draft)");
        const openDoc = await getChatDocument(profileId, chatId);
        const before = docSnap(openDoc);
        orchestratorMeter.current = zero();
        specialistMeter.current = zero();
        const logs: string[] = [];
        const origWarn = console.warn;
        const origError = console.error;
        console.warn = (...a: unknown[]) => void logs.push(redact(a.map(String).join(" ")));
        console.error = (...a: unknown[]) => void logs.push(redact(a.map(String).join(" ")));
        const t0 = Date.now();
        let status = 0;
        try {
          const res = await runChatTurn(deps, caller, {
            id: chatId,
            runId: randomUUID(),
            message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }], metadata: { createdAt: new Date().toISOString() } },
            selectedKnowledgeBaseIds: [],
            selectedWritingStyleId: null,
            webSearchEnabled: false,
            ...(chat.openDocument && openDoc ? { documentContext: { id: openDoc.id, version: openDoc.version } } : {}),
          });
          status = res.status;
          await res.text();
          await waitForRun(profileId, chatId);
        } finally {
          console.warn = origWarn;
          console.error = origError;
        }
        const latencyMs = Date.now() - t0;
        const reply = (await listMessages(profileId, chatId)).filter((m) => m.role === "assistant").at(-1);
        const summary = summarizeParts((reply?.parts ?? []) as unknown[]);
        const after = docSnap(await getChatDocument(profileId, chatId));
        const change = !after ? "none" : !before ? "created" : after.version !== before.version ? "updated" : "none";
        if (p.id === "c" && after) draftFromC = after.text;
        const ctx = (reply?.context ?? {}) as { finish?: string };
        const checkText = change !== "none" && after ? after.text : "";
        turns.push({
          promptId: p.id,
          chat: chat.name,
          prompt: text,
          latencyMs,
          finish: status === 200 ? (ctx.finish ?? "unknown") : `http ${status}`,
          tokens: { orchestrator: orchestratorMeter.current, specialists: specialistMeter.current },
          tools: summary.tools,
          text: summary.text,
          documentBefore: before,
          documentAfter: after,
          documentChange: change,
          checks: checkText ? runDeterministicChecks(checkText, { bannedWords: bannedWordsFromRules(EVAL_FIXTURE.memory["writing/rules"]!) }) : [],
          logs,
          verdict: null,
          pairwise: null,
        });
        console.log(`(${p.id}) ${(latencyMs / 1000).toFixed(1)} s · ${summary.tools.map((c) => c.name + (c.ok ? "" : "✗")).join(" → ") || "no tools"} · doc ${change}`);
      }
    }
  } catch (err) {
    failed = true;
    console.error(`FAILED during the chat turns -> ${redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err))}`);
  } finally {
    await removeEvalUser();
    if (profileId) cleanup = await evalRowsLeft(profileId);
    const left = Object.values(cleanup).reduce((a, b) => a + b, 0);
    console.log(`cleanup: eval user removed, rows left: ${left}`);
    if (left > 0) failed = true;
  }

  const pairwise = await judgeTurns(judge, turns, run, startedAt);

  const record: RunRecord = {
    run,
    startedAt,
    models: { generate: resolveModel("generate"), extract: resolveModel("extract") },
    turns,
    aggregate: aggregate(turns.filter((t) => t.verdict).map((t) => ({ promptId: t.promptId, verdict: t.verdict! }))),
    pairwise,
    cleanup,
  };
  writeFileSync(join(BENCH_DIR, `orbit-run-${run}.json`), JSON.stringify(record, null, 2));
  writeFileSync(join(BENCH_DIR, `orbit-run-${run}.md`), transcriptMarkdown(record));
  writeReport();
  console.log(`overall ${record.aggregate.overall?.toFixed(2) ?? "–"}; transcript ${join(BENCH_DIR, `orbit-run-${run}.md`)}`);
  if (pairwise) console.log(`pairwise: orbit ${pairwise.orbit}, kleo ${pairwise.kleo}, tie ${pairwise.tie}`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

void main();
