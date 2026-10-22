/** Run records (JSON next to each transcript) and the markdown written from them. */
import { DIMENSION_LABELS, DIMENSIONS, type Aggregate, type Pairwise, type PairwiseWinner, type Verdict } from "./rubric";
import type { ToolCall } from "./transcript";

export type DocSnapshot = { title: string; version: number; text: string };

export type TurnRecord = {
  promptId: string;
  chat: string;
  prompt: string;
  latencyMs: number;
  finish: string;
  tokens: { orchestrator: { input: number; output: number }; specialists: { input: number; output: number } };
  tools: ToolCall[];
  text: string;
  documentBefore: DocSnapshot | null;
  documentAfter: DocSnapshot | null;
  documentChange: "created" | "updated" | "none";
  checks: { id: string; passed: boolean; detail: string }[];
  logs: string[];
  verdict: Verdict | null;
  pairwise: { order: string; result: Pairwise; winner: PairwiseWinner } | null;
};

export type RunRecord = {
  run: number;
  startedAt: string;
  models: { generate: string; extract: string };
  turns: TurnRecord[];
  aggregate: Aggregate;
  pairwise: Record<PairwiseWinner, number> | null;
  cleanup: Record<string, number>;
};

const f1 = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(2));
const quote = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 220);
const fence = (s: string) => "```text\n" + s.replace(/```/g, "ʼʼʼ") + "\n```";

export function transcriptMarkdown(run: RunRecord): string {
  const out = [`# Orbit eval run ${run.run}`, "", `Started ${run.startedAt}. Models: generate ${run.models.generate}, extract ${run.models.extract}.`, ""];
  for (const t of run.turns) {
    out.push(`## (${t.promptId}) ${t.prompt.split("\n")[0]}`, "");
    out.push(`- Chat: ${t.chat}; finish: ${t.finish}; latency ${(t.latencyMs / 1000).toFixed(1)} s`);
    out.push(
      `- Tokens: orchestrator ${t.tokens.orchestrator.input} in / ${t.tokens.orchestrator.output} out; specialists ${t.tokens.specialists.input} in / ${t.tokens.specialists.output} out`,
    );
    out.push(`- Tools: ${t.tools.map((c) => `${c.name}${c.ok ? "" : " (failed)"}`).join(" → ") || "(none)"}`);
    out.push(`- Document: ${t.documentChange}${t.documentAfter ? ` (v${t.documentAfter.version}, "${t.documentAfter.title}", ${t.documentAfter.text.split(/\s+/).filter(Boolean).length} words)` : ""}`);
    if (t.logs.length) out.push(`- Logs: ${t.logs.map(quote).join(" | ")}`);
    out.push("", "**Prompt**", "", fence(t.prompt), "", "**Tool calls**", "");
    for (const c of t.tools) out.push(`- \`${c.name}\` ${c.state}: input ${quote(c.input)}`, `  - output: ${quote(c.output)}`);
    out.push("", "**Reply**", "", fence(t.text || "(no text)"));
    if (t.documentAfter && t.documentChange !== "none") out.push("", `**Document v${t.documentAfter.version}**`, "", fence(t.documentAfter.text));
    if (t.verdict) {
      out.push("", "**Judge**", "");
      for (const d of DIMENSIONS) out.push(`- ${DIMENSION_LABELS[d]}: ${t.verdict.scores[d].score ?? "n/a"} — ${t.verdict.scores[d].note}`);
      for (const fl of t.verdict.failures) out.push(`- FAIL [${fl.dimension}] "${quote(fl.excerpt)}": ${fl.problem}`);
    }
    if (t.pairwise) out.push("", `**Pairwise vs Kleo** (${t.pairwise.order}): ${t.pairwise.winner} — ${t.pairwise.result.reason}`);
    out.push("");
  }
  return out.join("\n");
}

/** The generated block of docs/research/orbit-quality-eval.md, from every run so far (oldest first). */
export function reportMarkdown(runs: RunRecord[]): string {
  if (runs.length === 0) return "No eval runs yet.";
  const latest = runs.at(-1)!;
  const out: string[] = [];
  out.push("## Scores by run", "", "Average judge score (1–5) per dimension, over the prompts where it applies.", "");
  out.push(`| Dimension | ${runs.map((r) => `Run ${r.run}`).join(" | ")} |`, `|---|${runs.map(() => "---").join("|")}|`);
  for (const d of DIMENSIONS) out.push(`| ${DIMENSION_LABELS[d]} | ${runs.map((r) => f1(r.aggregate.perDimension[d])).join(" | ")} |`);
  out.push(`| **Overall** | ${runs.map((r) => `**${f1(r.aggregate.overall)}**`).join(" | ")} |`, "");

  out.push("## Per prompt", "", `| Prompt | ${runs.map((r) => `Run ${r.run}`).join(" | ")} |`, `|---|${runs.map(() => "---").join("|")}|`);
  for (const t of latest.turns) {
    out.push(`| (${t.promptId}) ${t.prompt.split("\n")[0]!.slice(0, 70)} | ${runs.map((r) => f1(r.aggregate.perPrompt[t.promptId])).join(" | ")} |`);
  }
  out.push("");

  out.push(`## Latest run (${latest.run}): tools, latency, tokens`, "", "| Prompt | Tools in order | Doc | Latency | Tokens in/out |", "|---|---|---|---|---|");
  for (const t of latest.turns) {
    const tok = t.tokens;
    out.push(
      `| (${t.promptId}) | ${t.tools.map((c) => `${c.name}${c.ok ? "" : "✗"}`).join(" → ") || "–"} | ${t.documentChange} | ${(t.latencyMs / 1000).toFixed(1)} s | ${tok.orchestrator.input + tok.specialists.input} / ${tok.orchestrator.output + tok.specialists.output} |`,
    );
  }
  out.push("");

  out.push(`## Latest run (${latest.run}): failures the judge found`, "");
  let any = false;
  for (const t of latest.turns) {
    for (const fl of t.verdict?.failures ?? []) {
      any = true;
      out.push(`- (${t.promptId}) [${fl.dimension}] "${quote(fl.excerpt)}" — ${fl.problem}`);
    }
  }
  if (!any) out.push("None.");
  out.push("");

  out.push("## Orbit vs Kleo (blind pairwise)", "");
  const withPairs = runs.filter((r) => r.pairwise);
  if (withPairs.length === 0) {
    out.push("Not run: the Kleo benchmark replies (.recon/benchmark/kleo-replies.md) were not available.");
  } else {
    out.push(`| Run | Orbit wins | Kleo wins | Ties | Per prompt |`, "|---|---|---|---|---|");
    for (const r of withPairs) {
      const per = r.turns.map((t) => `${t.promptId}: ${t.pairwise?.winner ?? "–"}`).join(", ");
      out.push(`| ${r.run} | ${r.pairwise!.orbit} | ${r.pairwise!.kleo} | ${r.pairwise!.tie} | ${per} |`);
    }
    out.push("", `Reasons (run ${withPairs.at(-1)!.run}):`, "");
    for (const t of withPairs.at(-1)!.turns) if (t.pairwise) out.push(`- (${t.promptId}) ${t.pairwise.winner}: ${t.pairwise.result.reason}`);
  }
  out.push("");
  out.push("Raw transcripts: `.recon/benchmark/orbit-run-<n>.md` (with `orbit-run-<n>.json`).");
  return out.join("\n");
}

export const GENERATED_START = "<!-- eval:generated:start -->";
export const GENERATED_END = "<!-- eval:generated:end -->";

/** Replaces the generated block of the report, keeping the hand-written parts around it. */
export function spliceGenerated(existing: string | null, generated: string, header: string): string {
  const block = `${GENERATED_START}\n${generated}\n${GENERATED_END}`;
  if (!existing || !existing.includes(GENERATED_START) || !existing.includes(GENERATED_END)) return `${header}\n\n${block}\n`;
  const start = existing.indexOf(GENERATED_START);
  const end = existing.indexOf(GENERATED_END) + GENERATED_END.length;
  return `${existing.slice(0, start)}${block}${existing.slice(end)}`;
}
