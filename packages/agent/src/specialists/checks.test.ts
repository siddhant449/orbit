import { describe, expect, it } from "vitest";
import { resolveRules } from "../writing/rules";
import { bannedWordsFromRules, CHECK_IDS, mergeChecks, runDeterministicChecks, runWritingChecks } from "./checks";

const clean = [
  "Most founders build a proof of concept when they need a minimum viable product.",
  "",
  "A POC answers one question: can this work? An MVP answers a harder one: will anyone use it?",
  "",
  "Build the POC in a week. Ship the MVP to ten real users. Then decide. 🚀",
  "",
  "More in my notes: https://example.com/mvp",
  "",
  "#startups #product",
].join("\n");

const check = (text: string, id: string, bannedWords: string[] = []) =>
  runDeterministicChecks(text, { bannedWords }).find((c) => c.id === id)!;

describe("runDeterministicChecks", () => {
  it.each([
    ["length", "a".repeat(3001)],
    ["hook-length", `${"Hook ".repeat(41)}\n\nBody`],
    ["hashtags", "Post\n#a #b #c #d"],
    ["placeholders", "Hi [Name], here is"],
    ["placeholders", "Thanks {company} for this"],
    ["placeholders", "TODO: finish the ending"],
    ["markdown", "This is **bold**"],
    ["markdown", "# A heading\nBody"],
    ["markdown", "```\ncode\n```"],
    ["links", "https://a.com and https://b.com"],
    ["emoji", "Go 🚀🚀🚀🚀🚀🚀"],
  ])("fails %s", (id, text) => {
    const c = check(text, id);
    expect(c.passed).toBe(false);
    expect(c.detail).toBeTruthy();
  });

  it("fails banned words read from writing rules", () => {
    const words = bannedWordsFromRules("## Do\n- Short lines\n## Banned words\n- synergy\n- leverage");
    expect(words).toEqual(["synergy", "leverage"]);
    expect(check("Pure synergy here", "banned-words", words).passed).toBe(false);
    expect(check("Pure SYNERGY here", "banned-words", words).detail).toMatch(/synergy/i);
  });

  it("matches banned words as whole words only", () => {
    expect(check("We leveraged it", "banned-words", ["leverage"]).passed).toBe(true);
    expect(check("Deep dive into it", "banned-words", ["deep dive"]).passed).toBe(false);
  });

  it("passes a clean post on all 8 checks, in order", () => {
    const results = runDeterministicChecks(clean, { bannedWords: ["synergy"] });
    expect(results.map((r) => r.id)).toEqual([...CHECK_IDS]);
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it("does not count hashtags as a markdown heading", () => {
    expect(check("Post\n#startups #product", "markdown").passed).toBe(true);
  });

  it("counts __ as markdown only when it wraps text", () => {
    expect(check("Sign here: ____ and date: ____", "markdown").passed).toBe(true);
    expect(check("This is __important__ now", "markdown").passed).toBe(false);
  });

  it("doesn't count # followed by a digit as a hashtag", () => {
    expect(check("#1 lesson, #2 lesson, #3 lesson, #4 lesson #growth", "hashtags").passed).toBe(true);
  });
});

describe("bannedWordsFromRules", () => {
  it("reads bullets under any heading containing 'banned', strips quotes, and stops at the next heading", () => {
    const md = "# Rules\n- No hashtags\n### Never use (banned)\n* \"game-changer\"\n+ `delve`\n\n## Tone\n- Warm";
    expect(bannedWordsFromRules(md)).toEqual(["game-changer", "delve"]);
  });

  it("splits comma-separated bullets", () => {
    expect(bannedWordsFromRules("## Banned\n- synergy, leverage , \"deep dive\"")).toEqual(["synergy", "leverage", "deep dive"]);
  });

  it("returns nothing without a banned heading", () => {
    expect(bannedWordsFromRules("- Short paragraphs\n- No hashtags")).toEqual([]);
  });
});

describe("runWritingChecks", () => {
  const ctx = { postType: null, groundingText: null, researchDates: null, personalDetails: "allowed" as const };
  const rules = (md: string) => resolveRules({ userRulesMarkdown: md, style: null, turn: {} });

  it("returns nothing when no rule is set and the post is clean", () => {
    expect(runWritingChecks("Hook line.\n\nBody line.", rules(""), ctx)).toEqual([]);
  });

  it("returns one result per enforced rule, passing or failing", () => {
    const r = runWritingChecks("Launch day \u2014 finally.\n\nBody.", rules("- No emojis\n- Don't use em dashes"), ctx);
    expect(r.map((c) => [c.id, c.passed])).toEqual([["emoji", true], ["dashes", false]]);
  });

  it("does not repeat the banned-words, placeholders or markdown checks", () => {
    const r = runWritingChecks("Hook.\n\nreal synergy [Name] **bold**", rules("## Banned words\n- synergy"), ctx);
    expect(r.map((c) => c.id)).toEqual([]);
  });

  it("merges into the 8 checks without reordering them: a stricter result replaces the same id", () => {
    const base = runDeterministicChecks("Hook \ud83d\ude80\n\nBody.", { bannedWords: [] });
    const merged = mergeChecks(base, runWritingChecks("Hook \ud83d\ude80\n\nBody.", rules("- No emojis\n- Don't use em dashes"), ctx));
    expect(merged.slice(0, 8).map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(merged.find((c) => c.id === "emoji")!.passed).toBe(false);
    expect(merged.map((c) => c.id)).toEqual([...CHECK_IDS, "dashes"]);
  });
});
