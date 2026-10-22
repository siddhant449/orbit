import { describe, expect, it } from "vitest";
import { CATEGORIES, FRAMEWORKS, gatePurposes, HOOK_PURPOSES, HOOK_PURPOSE_IDS, pickPurposes, TEMPLATES, type HookPurpose } from "./index";

const ALL = new Set<HookPurpose>(HOOK_PURPOSE_IDS);
const DENY = ["justin welsh", "jasmin alic", "george blackman", "lara acosta", "dan koe", "alex hormozi", "sahil bloom", "kleo", "linkedin influencer"];

describe("library", () => {
  it("ships 12 purposes, 6 frameworks, 15 categories, 24 templates with no creator names", () => {
    expect(HOOK_PURPOSES).toHaveLength(12);
    expect(FRAMEWORKS).toHaveLength(6);
    expect(CATEGORIES).toHaveLength(15);
    expect(TEMPLATES).toHaveLength(24);
    const all = JSON.stringify([HOOK_PURPOSES, FRAMEWORKS, CATEGORIES, TEMPLATES]).toLowerCase();
    for (const name of DENY) expect(all).not.toContain(name);
    expect(new Set(HOOK_PURPOSES.map((p) => p.id)).size).toBe(12);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(24);
  });

  it("every template belongs to a category and every purpose has two examples and a label", () => {
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TEMPLATES) expect(cats.has(t.category), t.id).toBe(true);
    for (const p of HOOK_PURPOSES) expect(p.examples.every((e) => e.includes("["))).toBe(true);
    for (const f of FRAMEWORKS) expect(f.plan[0]!.kind).toBe("hook");
  });

  it("picks distinct purposes and avoids the last set", () => {
    const a = pickPurposes({ count: 5, available: ALL, recent: [], seed: "s" });
    expect(new Set(a).size).toBe(5);
    expect(pickPurposes({ count: 5, available: ALL, recent: [], seed: "s" })).toEqual(a);
    const b = pickPurposes({ count: 5, available: ALL, recent: a, seed: "s" });
    expect(b.filter((p) => a.includes(p))).toHaveLength(0);
  });

  it("falls back to recent purposes only when the rest are used up", () => {
    const few = new Set<HookPurpose>(["claim", "mistake", "contrarian"]);
    const out = pickPurposes({ count: 3, available: few, recent: ["claim"], seed: "s" });
    expect(new Set(out).size).toBe(3);
    expect(out.at(-1)).toBe("claim");
  });

  it("gates story, proof, number and announcement on evidence, and question under forbidRhetoricalOpening", () => {
    const none = gatePurposes({ hasStory: false, numbers: [], hasNews: false }, { forbidRhetoricalOpening: false });
    for (const p of ["story", "proof", "number", "announcement"] as const) expect(none.available.has(p), p).toBe(false);
    expect(none.skipped.find((s) => s.purpose === "proof")!.reason).toMatch(/number/);
    expect(none.available.size).toBe(8);
    const withEvidence = gatePurposes({ hasStory: true, numbers: ["3"], hasNews: true }, { forbidRhetoricalOpening: true });
    expect(withEvidence.available.has("question")).toBe(false);
    expect(withEvidence.skipped).toEqual([{ purpose: "question", reason: "your rules forbid a question opening" }]);
    expect(withEvidence.available.size).toBe(11);
  });
});
