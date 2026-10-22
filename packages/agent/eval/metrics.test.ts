import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { kleoPostFences, metricsFromTranscripts, metricsTableMarkdown, spliceMetrics } from "./metrics";
import { measurePost } from "../src/writing/measure";

describe("eval metrics", () => {
  it("reproduces the WQ §6 shape on a synthetic one-line-per-block post", () => {
    const post = Array.from({ length: 8 }, (_, i) => `Short sentence number ${i + 1} stays on one line.`).join("\n\n");
    const m = measurePost(post);
    expect(m.maxBlockMobileLines).toBe(1);
    expect(m.maxBlockLines).toBe(1);
    expect(m.oneLineBlockShare).toBe(1);
    expect(m.bulletLists + m.numberedLists).toBe(0);
  });

  it("reads post fences from the Kleo lab file", () => {
    const md = "intro\n\n```post K1 justin\nHook.\n\n- a\n- b\n```\n\ntext\n\n```post K8 bench-c\nOther hook.\n\nBody.\n```\n";
    const fences = kleoPostFences(md);
    expect(fences.map((f) => f.id)).toEqual(["K1", "K8"]);
    expect(fences[0]!.text).toBe("Hook.\n\n- a\n- b");
  });

  it("reads drafts from orbit run files and skips turns without a post", () => {
    const dir = mkdtempSync(join(tmpdir(), "metrics-"));
    const file = join(dir, "orbit-run-4.json");
    writeFileSync(file, JSON.stringify({ run: 4, turns: [
      { promptId: "c", documentChange: "created", documentAfter: { text: "Hook.\n\nBody." } },
      { promptId: "e", documentChange: "none", documentAfter: null },
    ] }));
    const rows = metricsFromTranscripts([file]);
    expect(rows.map((r) => [r.id, r.source])).toEqual([["O4c", "orbit"]]);
    expect(rows[0]!.metrics.blocks).toBe(2);
  });

  it("renders a table and splices it between its own markers without touching the rest", () => {
    const rows = [{ id: "O4c", source: "orbit" as const, metrics: measurePost("Hook.\n\nBody.") }];
    const table = metricsTableMarkdown(rows);
    expect(table).toContain("| O4c |");
    const doc = "before\n<!-- eval:generated:end -->\nafter";
    const once = spliceMetrics(doc, table);
    expect(once).toContain("Formatting metrics");
    expect(spliceMetrics(once, table)).toBe(once);
    expect(once.startsWith("before")).toBe(true);
  });
});
