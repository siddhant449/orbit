import { describe, expect, it } from "vitest";
import { acceptOverrides, compileHardRules, enforcedChips, DEFAULT_HARD_RULES, DEFAULT_TARGETS, resolveRules, type StyleLike, type TurnOverrides } from "./rules";

const none: TurnOverrides = { allowEmoji: null, allowHashtags: null, allowDashes: null, allowPostscript: null, allowLinks: null };

const styleWithEmojiCtaAndPs: StyleLike = {
  layout: { ...DEFAULT_TARGETS, emoji: { perPost: 2, positions: ["cta", "line-end"] }, postscriptPercent: 76 },
  rules: {
    hooks: { do: ["Open with a flat claim"], dont: [] },
    rhythm: { do: [], dont: [] },
    formatting: { do: ["End with an emoji CTA such as 👇 before the last line"], dont: [] },
    diction: { do: [], dont: [] },
    closings: { do: [], dont: [] },
    global: { do: [], dont: [] },
  },
  signatureMoves: [
    { label: "Postscript nudge", pattern: "P.S. [one-line offer]", useWhen: "the post teaches something" },
    { label: "Flat rule", pattern: "[Rule]. [Why].", useWhen: "closing" },
  ],
};

describe("compileHardRules", () => {
  it.each([
    ["- No emojis", "forbidEmoji"],
    ["- Don't use emoji", "forbidEmoji"],
    ["- Don't use em dashes", "forbidDashes"],
    ["- No keyword hashtags", "forbidHashtags"],
    ["- Never add a P.S.", "forbidPostscript"],
    ["- No walls of text (>3 lines)", "maxBlockLines"],
    ["- British spelling", "spelling"],
    ["- Never open with a rhetorical question", "forbidRhetoricalOpening"],
    ["- No links in the post", "forbidLinks"],
  ] as const)("compiles %s", (line, rule) => {
    expect(compileHardRules(`## Don't\n${line}`).matched.map((m) => m.rule)).toContain(rule);
  });

  it("reads the numbers and values", () => {
    const { rules } = compileHardRules("- No walls of text (>3 lines)\n- British spelling\n## Banned words\n- synergy, leverage");
    expect(rules.maxBlockLines).toBe(3);
    expect(rules.spelling).toBe("en-GB");
    expect(rules.bannedPhrases).toEqual(["synergy", "leverage"]);
  });

  it("matches nothing in a rule that only sounds similar", () => {
    const { matched } = compileHardRules("- Emojis are fine in moderation\n- Write dashes of colour into scenes\n- Sound like a friend");
    expect(matched).toEqual([]);
  });

  it("starts with everything off", () => {
    expect(compileHardRules("").rules).toEqual(DEFAULT_HARD_RULES);
    expect(DEFAULT_HARD_RULES.maxHashtags).toBe(3);
  });
});

describe("resolveRules", () => {
  it("leaves unrecognised rules soft", () => {
    const r = resolveRules({ userRulesMarkdown: "## Do\n- Sound like a friend\n- No emojis", style: null, turn: {} });
    expect(r.soft.map((s) => s.text)).toEqual(["Sound like a friend"]);
    expect(r.soft[0]!.source).toBe("user");
    expect(r.hard.forbidEmoji).toBe(true);
  });

  it("user hard rules beat style moves", () => {
    const r = resolveRules({ userRulesMarkdown: "- No emojis\n- Never add a P.S.", style: styleWithEmojiCtaAndPs, turn: {} });
    expect(r.dropped.map((d) => d.text).join(" ")).toMatch(/P\.S\./);
    expect(r.dropped.map((d) => d.text).join(" ")).toMatch(/emoji CTA/);
    expect(r.targets.emoji.perPost).toBe(0);
    expect(r.targets.postscriptPercent).toBe(0);
    // The flat-rule move is unaffected.
    expect(r.soft.map((s) => s.text).join(" ")).toContain("Flat rule");
    expect(r.soft.map((s) => s.text).join(" ")).not.toContain("P.S.");
  });

  it("keeps style habits that the user's rules do not forbid", () => {
    const r = resolveRules({ userRulesMarkdown: "", style: styleWithEmojiCtaAndPs, turn: {} });
    expect(r.dropped).toEqual([]);
    expect(r.targets.emoji.perPost).toBe(2);
  });

  it("a turn override loosens a saved rule and the targets with it", () => {
    const r = resolveRules({ userRulesMarkdown: "- No emojis", style: null, turn: { allowEmoji: true } });
    expect(r.hard.forbidEmoji).toBe(false);
    expect(r.targets.emoji.perPost).toBeGreaterThan(0);
    expect(r.overrides).toEqual({ allowEmoji: true });
  });

  it("caps three-line blocks when the rule allows at most two lines", () => {
    const r = resolveRules({ userRulesMarkdown: "- Max 2 lines per paragraph", style: null, turn: {} });
    expect(r.hard.maxBlockLines).toBe(2);
    expect(r.targets.blockLineMix.threePlus).toBe(0);
  });
});

describe("acceptOverrides", () => {
  it("accepts an override only when the user asked this turn", () => {
    expect(acceptOverrides({ ...none, allowEmoji: true }, "make it punchier")).toEqual({});
    expect(acceptOverrides({ ...none, allowEmoji: true }, "add a couple of emojis this time")).toEqual({ allowEmoji: true });
  });

  it("matches each keyword and ignores nulls and false", () => {
    const all: TurnOverrides = { allowEmoji: true, allowHashtags: true, allowDashes: true, allowPostscript: true, allowLinks: true };
    expect(acceptOverrides(all, "use a hashtag, a P.S. and a link")).toEqual({ allowHashtags: true, allowPostscript: true, allowLinks: true });
    expect(acceptOverrides(null, "emoji please")).toEqual({});
    expect(acceptOverrides({ ...none, allowDashes: false }, "dash")).toEqual({});
  });
});

describe("enforcedChips", () => {
  it("names each enforced rule in plain words, and counts the rest as guidance", () => {
    const md = "- No emojis\n- Don't use em dashes\n- No walls of text (>3 lines)\n- British spelling\n- Sound like a friend\n## Banned words\n- synergy, leverage";
    const { chips, guidance } = enforcedChips(md);
    expect(chips).toEqual(["No emoji", "No dashes", "3 lines per block at most", "British spelling", "2 banned words"]);
    expect(guidance).toBe(1);
  });

  it("is empty for no rules", () => {
    expect(enforcedChips("")).toEqual({ chips: [], guidance: 0 });
  });
});
