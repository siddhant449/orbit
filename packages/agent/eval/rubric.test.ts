import { describe, expect, it } from "vitest";
import { aggregate, blindOrder, DIMENSIONS, kleoDraft, normalizeVerdict, parseKleoReplies, tallyPairwise, unblind, type Verdict } from "./rubric";

const verdict = (scores: Record<string, number | null>) =>
  normalizeVerdict({
    scores: Object.fromEntries(DIMENSIONS.map((d) => [d, { score: scores[d] ?? null, note: "n" }])) as Verdict["scores"],
    failures: [],
    summary: "s",
  });

describe("normalizeVerdict", () => {
  it("rounds and clamps scores into 1..5 and keeps null for not applicable", () => {
    const v = normalizeVerdict({
      scores: Object.fromEntries(DIMENSIONS.map((d, i) => [d, { score: [0, 7, 3.6, null, 2, 5][i] ?? null, note: "x" }])) as Verdict["scores"],
      failures: [],
      summary: "",
    });
    expect(DIMENSIONS.map((d) => v.scores[d].score)).toEqual([1, 5, 4, null, 2, 5]);
  });
});

describe("aggregate", () => {
  it("averages each dimension over the prompts where it applies, and the overall over every applicable score", () => {
    const res = aggregate([
      { promptId: "a", verdict: verdict({ memory: 5, voice: null, craft: null, instruction: 4, tools: 5, grounding: 5 }) },
      { promptId: "c", verdict: verdict({ memory: 3, voice: 2, craft: 3, instruction: 4, tools: 1, grounding: 5 }) },
    ]);
    expect(res.perDimension.memory).toBe(4);
    expect(res.perDimension.voice).toBe(2);
    expect(res.perDimension.tools).toBe(3);
    expect(res.perPrompt.a).toBe(4.75);
    expect(res.perPrompt.c).toBeCloseTo(3, 5);
    // 4 + 6 applicable scores: (19 + 18) / 10
    expect(res.overall).toBeCloseTo(3.7, 5);
  });

  it("reports null for a dimension no prompt scored", () => {
    const res = aggregate([{ promptId: "a", verdict: verdict({ memory: 5 }) }]);
    expect(res.perDimension.voice).toBeNull();
    expect(aggregate([]).overall).toBeNull();
  });
});

describe("pairwise blinding", () => {
  it("is deterministic per prompt and run, and mixes orders across prompts", () => {
    expect(blindOrder("c", 1)).toBe(blindOrder("c", 1));
    const orders = new Set(["a", "b", "c", "d", "e", "f"].map((p) => blindOrder(p, 1)));
    expect(orders.size).toBe(2);
  });

  it("maps the judge's A/B answer back to the right system", () => {
    expect(unblind("A", "orbit-first")).toBe("orbit");
    expect(unblind("B", "orbit-first")).toBe("kleo");
    expect(unblind("A", "kleo-first")).toBe("kleo");
    expect(unblind("B", "kleo-first")).toBe("orbit");
    expect(unblind("tie", "kleo-first")).toBe("tie");
  });

  it("tallies outcomes", () => {
    expect(tallyPairwise(["orbit", "kleo", "tie", "orbit"])).toEqual({ orbit: 2, kleo: 1, tie: 1 });
  });
});

describe("parseKleoReplies", () => {
  it("splits the benchmark file into one reply per prompt letter", () => {
    const md = [
      "# Kleo benchmark replies",
      "Captured 2026-10-22.",
      "",
      "## (a) What do you remember about me?",
      "Here is what I know.",
      "",
      "- point",
      "## (b) Give me 5 post ideas",
      "1. Idea",
      "### Tools",
      "viewMemory",
      "## Prompt (c): Draft a LinkedIn post",
      "Post text",
    ].join("\n");
    const out = parseKleoReplies(md);
    expect(Object.keys(out)).toEqual(["a", "b", "c"]);
    expect(out.a).toBe("Here is what I know.\n\n- point");
    expect(out.b).toContain("viewMemory");
    expect(out.c).toBe("Post text");
  });

  it("accepts '=== (a) USER:' separators and drops stream sequences and the capturer's quality notes", () => {
    const md = ["# Kleo", "| a | viewMemory |", "=== (a) USER: What do you remember?", "SEQ: start > DONE", "TOOL INPUT x", "ASSISTANT TEXT:", "Hi.", "QUALITY NOTE: the capturer's opinion", "", "=== (b) USER: ideas", "Five."].join("\n");
    const out = parseKleoReplies(md);
    expect(out.a).toBe("TOOL INPUT x\nASSISTANT TEXT:\nHi.");
    expect(out.b).toBe("Five.");
  });

  it("returns an empty map when no prompt headings are found", () => {
    expect(parseKleoReplies("nothing here")).toEqual({});
  });
});

describe("kleoDraft", () => {
  it("pulls the verbatim post out of a captured Kleo section", () => {
    const section = ["TOOL INPUT x", "POST (draft c, verbatim):", "Line one.", "", "Line two.", "", "ASSISTANT TEXT:", "Here it is."].join("\n");
    expect(kleoDraft(section)).toBe("Line one.\n\nLine two.");
  });

  it("returns null when the section has no post", () => {
    expect(kleoDraft("ASSISTANT TEXT:\nNo post here.")).toBeNull();
  });
});
