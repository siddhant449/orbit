import { describe, expect, it } from "vitest";
import { CHARS_PER_MOBILE_LINE, LINKEDIN_FOLD_CHARS, measureCorpus, measurePost, mobileLines, splitBlocks } from "./measure";

describe("measurePost", () => {
  it("groups adjacent lines into one block and spots lists", () => {
    const m = measurePost("Hook line here.\n\nSet-up line:\n- one\n- two\n- three\n\nClose.");
    expect(m.blocks).toBe(3);
    expect(m.bulletLists).toBe(1);
    expect(m.listItems).toBe(3);
    expect(m.oneLineBlockShare).toBeCloseTo(2 / 3);
  });

  it("splits blocks on blank lines and types list blocks", () => {
    const b = splitBlocks("a\n\n1. x\n2. y\n\n- p\n- q");
    expect(b.map((x) => x.kind)).toEqual(["prose", "numbered", "bullets"]);
  });

  it("counts one-line blocks by source lines, as the WQ §6 table does, and mobile lines separately", () => {
    const para = "This paragraph is one source line but it wraps on a phone, so it takes three mobile lines in the feed.";
    const m = measurePost(`${para}\n\n${para}`);
    expect(m.oneLineBlockShare).toBe(1);
    expect(m.maxBlockLines).toBe(1);
    expect(m.maxBlockMobileLines).toBe(3);
  });

  it("wraps at 50 chars for mobile lines", () => {
    expect(CHARS_PER_MOBILE_LINE).toBe(50);
    expect(mobileLines("a ".repeat(40).trim())).toBe(2);
    expect(mobileLines("")).toBe(0);
    expect(mobileLines("x".repeat(120))).toBe(3);
  });

  it("measures the hook and the fold", () => {
    const hook = "x".repeat(8) + " " + "y".repeat(39); // 48 chars
    const a = measurePost(`${hook}\n\nThe promise follows here.`);
    expect(a.hookChars).toBe(48);
    expect(a.hookMobileLines).toBe(1);
    expect(a.hookEndsBeforeFold).toBe(true);
    expect(a.promiseBeforeFold).toBe(true);
    const long = Array.from({ length: 40 }, () => "word").join(" ") + " end"; // > 200 chars
    const b = measurePost(`${long.padEnd(260, "z")}\n\nSecond block.`);
    expect(b.hookChars).toBeGreaterThan(LINKEDIN_FOLD_CHARS);
    expect(b.promiseBeforeFold).toBe(false);
  });

  it("counts emoji positions (a family is one), dashes (not hyphens or ranges), hashtags, P.S. and links", () => {
    const m = measurePost("🚀 Launch day — finally\n\nMy co-founder and I ship 3–5 times a week 👨‍👩‍👧\n\nIt is #1 for us #growth #saas https://example.com\n\nP.S. one more thing");
    expect(m.emoji.count).toBe(2);
    expect(m.emoji.positions).toEqual(["line-start", "line-end"]);
    expect(m.dashes).toBe(1);
    expect(m.hashtags).toBe(2);
    expect(m.postscript).toBe(true);
    expect(m.links).toBe(1);
  });

  it("does not take a P.S. inside a sentence or a plain hyphen for style violations", () => {
    const m = measurePost("We wrote a P.S. to the letter.\n\nA well-known, state-of-the-art fix.");
    expect(m.postscript).toBe(false);
    expect(m.dashes).toBe(0);
    expect(m.hashtags).toBe(0);
  });

  it("keeps list numbering out of the numbers and reads amounts", () => {
    const m = measurePost("Three things:\n1. cut 40% of scope\n2. ship in 2 weeks\n3. charge $1,200");
    expect(m.numberedLists).toBe(1);
    expect(m.numbers).toEqual(["40%", "2", "$1,200"]);
  });

  it("classifies the ending", () => {
    expect(measurePost("Hook.\n\nWhat would you cut?").ending).toBe("question");
    expect(measurePost("Hook.\n\nSources: Example (21 Oct)").ending).toBe("sources");
    expect(measurePost("Hook.\n\nComment MVP below and I will send it.").ending).toBe("cta");
    expect(measurePost("Hook.\n\nNever ship the first idea.").ending).toBe("rule");
    expect(measurePost("Hook.\n\nThat was a long week.").ending).toBe("statement");
  });

  it("is empty-safe", () => {
    const m = measurePost("   ");
    expect(m.blocks).toBe(0);
    expect(m.hookChars).toBe(0);
  });
});

describe("measureCorpus", () => {
  it("computes corpus ranges from p10/median/p90", () => {
    const posts = [
      "Short hook one.\n\nBody a.",
      "A somewhat longer hook line here.\n\nBody b is a bit longer than a.\n\n- x\n- y",
      "Hook three is medium sized.\n\nBody c.",
      "Another hook that runs on a bit more.\n\nBody d.\n\nWhat do you think?",
      "Tiny.\n\nSources: Example (21 Oct)",
    ];
    const c = measureCorpus(posts);
    expect(c.hookChars.low).toBeLessThanOrEqual(c.hookChars.typical);
    expect(c.hookChars.typical).toBeLessThanOrEqual(c.hookChars.high);
    expect(c.postChars.high).toBeGreaterThan(c.postChars.low);
    expect(c.listPosts.bullet).toBe(20);
    expect(c.endings.question).toBe(20);
    expect(c.endings.sources).toBe(20);
    expect(c.blockLineMix.one + c.blockLineMix.two + c.blockLineMix.threePlus).toBeGreaterThanOrEqual(99);
  });
});
