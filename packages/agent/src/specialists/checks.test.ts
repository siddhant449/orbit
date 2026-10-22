import { describe, expect, it } from "vitest";
import { bannedWordsFromRules, CHECK_IDS, runDeterministicChecks } from "./checks";

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
});

describe("bannedWordsFromRules", () => {
  it("reads bullets under any heading containing 'banned', strips quotes, and stops at the next heading", () => {
    const md = "# Rules\n- No hashtags\n### Never use (banned)\n* \"game-changer\"\n+ `delve`\n\n## Tone\n- Warm";
    expect(bannedWordsFromRules(md)).toEqual(["game-changer", "delve"]);
  });

  it("returns nothing without a banned heading", () => {
    expect(bannedWordsFromRules("- Short paragraphs\n- No hashtags")).toEqual([]);
  });
});
