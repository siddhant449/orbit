/** Formatting metrics over saved drafts: the WQ §6 table in TypeScript. No AI calls; reads transcripts and the Kleo lab file. */
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { measurePost, type PostMetrics } from "../src/writing/measure";

export type MetricRow = { id: string; source: "orbit" | "kleo"; metrics: PostMetrics };

/** The ```post fences of kleo-quality-lab.md: "```post K1 justin" starts one, the id is the first word after "post". */
export function kleoPostFences(markdown: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  const re = /^```post[ \t]+(\S+)[^\n]*\n([\s\S]*?)\n```/gm;
  for (const m of markdown.matchAll(re)) out.push({ id: m[1]!, text: m[2]! });
  return out;
}

/** Drafts from orbit-run-<n>.json files, as ids like "O4c" (run 4, prompt c). Turns that left no post are skipped. */
export function metricsFromTranscripts(runFiles: string[], kleoLab?: string | null): MetricRow[] {
  const rows: MetricRow[] = [];
  if (kleoLab && existsSync(kleoLab)) {
    for (const f of kleoPostFences(readFileSync(kleoLab, "utf8"))) rows.push({ id: f.id, source: "kleo", metrics: measurePost(f.text) });
  }
  for (const file of runFiles) {
    const run = JSON.parse(readFileSync(file, "utf8")) as {
      run?: number;
      turns: { promptId: string; documentChange: string; documentAfter: { text: string } | null }[];
    };
    const n = run.run ?? Number(/orbit-run-(\d+)/.exec(basename(file))?.[1] ?? 0);
    for (const t of run.turns) {
      if (t.documentChange === "none" || !t.documentAfter?.text) continue;
      rows.push({ id: `O${n}${t.promptId}`, source: "orbit", metrics: measurePost(t.documentAfter.text) });
    }
  }
  return rows;
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

export function metricsTableMarkdown(rows: MetricRow[]): string {
  const head = [
    "| id | words | chars | lines | blocks | avg chars/line | max lines in a block (mobile) | blank-line ratio | one-line share | emoji | hook chars / lines | fold | lists (bullet/numbered) | numbers | ending | hashtags | dashes | links |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const body = rows.map(({ id, metrics: m }) =>
    `| ${id} | ${m.words} | ${m.chars} | ${m.lines} | ${m.blocks} | ${m.avgCharsPerLine} | ${m.maxBlockLines} (${m.maxBlockMobileLines}) | ${f2(m.blankLineRatio)} | ${f2(m.oneLineBlockShare)} | ${m.emoji.count} | ${m.hookChars} / ${m.hookMobileLines} | ${m.promiseBeforeFold ? "fits" : "after fold"} | ${m.bulletLists}/${m.numberedLists} | ${m.numbers.length} | ${m.ending} | ${m.hashtags} | ${m.dashes} | ${m.links} |`,
  );
  return [...head, ...body].join("\n");
}

export const METRICS_START = "<!-- eval:metrics:start -->";
export const METRICS_END = "<!-- eval:metrics:end -->";

const METRICS_INTRO =
  "## Formatting metrics\n\nComputed by `measurePost` (packages/agent/src/writing/measure.ts) over Kleo's `post` fences (K) and Orbit's saved drafts (O<run><prompt>); " +
  "regenerate with `pnpm --filter @brandloop/agent eval --metrics` (no AI calls). Mobile wrap 50 characters per line; fold 210 characters.";

/** Replaces (or, the first time, appends after the generated block) the metrics section; the rest of the report is untouched. */
export function spliceMetrics(existing: string, table: string): string {
  const block = `${METRICS_START}\n${METRICS_INTRO}\n\n${table}\n${METRICS_END}`;
  if (existing.includes(METRICS_START) && existing.includes(METRICS_END)) {
    const start = existing.indexOf(METRICS_START);
    const end = existing.indexOf(METRICS_END) + METRICS_END.length;
    return `${existing.slice(0, start)}${block}${existing.slice(end)}`;
  }
  const anchor = "<!-- eval:generated:end -->";
  const at = existing.indexOf(anchor);
  if (at === -1) return `${existing.trimEnd()}\n\n${block}\n`;
  const end = at + anchor.length;
  return `${existing.slice(0, end)}\n\n${block}${existing.slice(end)}`;
}
