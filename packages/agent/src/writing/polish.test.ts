import { describe, expect, it } from "vitest";
import { fakeAi } from "../test/fixtures";
import { measurePost } from "./measure";
import { lastResort, mechanicalFix, polishDraft, polishText } from "./polish";
import { renderBlocks, type WriterBlock } from "./render";
import { resolveRules } from "./rules";

const rules = (md = "") => resolveRules({ userRulesMarkdown: md, style: null, turn: {} });
const lintCtx = { postType: null, groundingText: null, researchDates: null, personalDetails: "allowed" as const };
const far = () => new Date(Date.now() + 120_000);
const base = { request: "r", grounding: "g", lintCtx, deadline: far(), render: { bullet: "-" as const, numbered: true } };

const wall = Array.from({ length: 26 }, () => "words").join(" ") + " and a few more words to make this block long on a phone screen";
const CLEAN: WriterBlock[] = [
  { kind: "hook", lines: ["Stop building the wrong thing."] },
  { kind: "prose", lines: ["A proof of concept answers one question.", "An MVP answers a harder one."] },
  { kind: "close", lines: ["Pick the harder one first."] },
];

describe("mechanicalFix", () => {
  it("strips bold, drops a hashtag-only last line when hashtags are forbidden, collapses newlines", () => {
    const r = mechanicalFix("**Hook** here\n\n\n\nBody.\n\n#ai #mvp", rules("- No hashtags"), "-");
    expect(r.text).toBe("Hook here\n\nBody.");
    expect(r.notes.length).toBeGreaterThanOrEqual(2);
  });

  it("drops a final P.S. block only when forbidden", () => {
    expect(mechanicalFix("Hook.\n\nBody.\n\nP.S. one more", rules("- Never add a P.S."), "-").text).toBe("Hook.\n\nBody.");
    expect(mechanicalFix("Hook.\n\nBody.\n\nP.S. one more", rules(), "-").text).toContain("P.S.");
  });

  it("closes blank lines between list items and normalises bullet glyphs", () => {
    expect(mechanicalFix("Hook.\n\n* one\n\n* two\n\n• three", rules(), "-").text).toBe("Hook.\n\n- one\n- two\n- three");
  });

  it("leaves a clean post untouched", () => {
    const r = mechanicalFix("Hook.\n\nBody.", rules(), "-");
    expect(r).toEqual({ text: "Hook.\n\nBody.", notes: [] });
  });
});

describe("lastResort", () => {
  it("removes emoji and rewrites dashes only when the rules forbid them, keeping ranges and hyphens", () => {
    const r = rules("- No emojis\n- Don't use em dashes");
    const out = lastResort("Launch \u{1F680} day \u2014 finally. Ship 2\u20133 times with co-founders \u2013 not alone.", r);
    expect(out.text).toBe("Launch day, finally. Ship 2\u20133 times with co-founders, not alone.");
    expect(out.notes.length).toBe(2);
    expect(lastResort("Keep \u{1F680} \u2014 all", rules()).text).toBe("Keep \u{1F680} \u2014 all");
  });

  it("removes hashtags when forbidden", () => {
    expect(lastResort("Great post #growth about #1 ideas", rules("- No hashtags")).text).toBe("Great post about #1 ideas");
  });
});

describe("polishDraft", () => {
  it("fixes mechanical issues without a model call", async () => {
    const ai = fakeAi();
    const blocks: WriterBlock[] = [...CLEAN, { kind: "prose", lines: ["#ai #mvp"] }];
    const out = await polishDraft(ai, { ...base, blocks, rules: rules("- No hashtags") });
    expect(out.text).not.toMatch(/#ai/);
    expect(out.log.mechanical.length).toBeGreaterThan(0);
    expect(ai.calls).toHaveLength(0);
  });

  it("runs one model repair for a long block and re-lints", async () => {
    const split: WriterBlock[] = [
      CLEAN[0]!,
      { kind: "prose", lines: ["words ".repeat(12).trim()] },
      { kind: "prose", lines: ["words ".repeat(12).trim()] },
      CLEAN[2]!,
    ];
    const ai = fakeAi({ blocks: split });
    const blocks: WriterBlock[] = [CLEAN[0]!, { kind: "prose", lines: [wall] }, CLEAN[2]!];
    const out = await polishDraft(ai, { ...base, blocks, rules: rules("- No walls of text (>3 lines)") });
    expect(ai.calls).toHaveLength(1);
    expect(out.log.modelRepair).toMatchObject({ attempted: true, fixed: ["block-lines"] });
    expect(out.log.remaining.filter((v) => v.level === "hard")).toEqual([]);
    expect(measurePost(out.text).maxBlockMobileLines).toBeLessThanOrEqual(3);
  });

  it("never runs a second model repair, and the last resort still clears an emoji", async () => {
    const stillBad: WriterBlock[] = [{ kind: "hook", lines: ["Hook \u{1F680} \u2014 here."] }, { kind: "prose", lines: [wall] }];
    const ai = fakeAi({ blocks: stillBad });
    const out = await polishDraft(ai, { ...base, blocks: stillBad, rules: rules("- No emojis\n- No walls of text (>3 lines)\n- Don't use em dashes") });
    expect(ai.calls).toHaveLength(1);
    expect(out.text).not.toMatch(/\u{1F680}|\u2014/u);
    expect(out.log.lastResort.length).toBeGreaterThan(0);
    expect(out.log.remaining.some((v) => v.id === "block-lines")).toBe(true);
  });

  it("skips the model repair near the deadline", async () => {
    const ai = fakeAi({ blocks: CLEAN });
    const out = await polishDraft(ai, { ...base, deadline: new Date(Date.now() + 10_000), blocks: [CLEAN[0]!, { kind: "prose", lines: [wall] }], rules: rules("- No walls of text (>3 lines)") });
    expect(out.log.modelRepair.attempted).toBe(false);
    expect(ai.calls).toHaveLength(0);
  });

  it("repairs a number the user never gave, or reports it", async () => {
    const bad: WriterBlock[] = [{ kind: "hook", lines: ["We cut churn by 37%."] }, { kind: "prose", lines: ["It worked."] }];
    const good: WriterBlock[] = [{ kind: "hook", lines: ["We cut churn."] }, { kind: "prose", lines: ["It worked."] }];
    const ctx = { ...lintCtx, groundingText: "The user wrote a note about churn." };
    const fixed = await polishDraft(fakeAi({ blocks: good }), { ...base, blocks: bad, rules: rules(), lintCtx: ctx });
    expect(fixed.text).not.toContain("37");
    expect(fixed.log.modelRepair.fixed).toContain("number-provenance");
    const stuck = await polishDraft(fakeAi({ blocks: bad }), { ...base, blocks: bad, rules: rules(), lintCtx: ctx });
    expect(stuck.log.remaining.some((v) => v.id === "number-provenance")).toBe(true);
  });

  it("makes no call for a clean draft", async () => {
    const ai = fakeAi();
    const out = await polishDraft(ai, { ...base, blocks: CLEAN, rules: rules("- No emojis") });
    expect(ai.calls).toHaveLength(0);
    expect(out.text).toBe(renderBlocks(CLEAN, base.render));
    expect(out.log).toMatchObject({ mechanical: [], lastResort: [] });
  });
});

describe("polishText", () => {
  const doc = { id: "d", title: "T", version: 1 };
  it("applies the mechanical fixes and last resort to edited text with no model call", async () => {
    const ai = fakeAi();
    const out = await polishText(ai, { ...base, text: "Launch \u2014 now \u{1F680}\n\nBody.", document: doc, rules: rules("- No emojis\n- Don't use em dashes") });
    expect(out.text).toBe("Launch, now\n\nBody.");
    expect(ai.calls).toHaveLength(0);
  });

  it("repairs a long block through the editor", async () => {
    const ai = fakeAi({ text: "Hook.\n\nShort one.\n\nShort two.", changeSummary: "Split", unmetRequirements: [] });
    const out = await polishText(ai, { ...base, text: `Hook.\n\n${wall}`, document: doc, rules: rules("- No walls of text (>3 lines)") });
    expect(ai.calls).toHaveLength(1);
    expect(out.text).toBe("Hook.\n\nShort one.\n\nShort two.");
    expect(out.log.modelRepair.fixed).toContain("block-lines");
  });
});
