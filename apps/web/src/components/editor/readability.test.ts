import { describe, expect, it } from "vitest";
import { readability, syllables } from "./readability";

describe("syllables", () => {
  it.each([
    ["cat", 1],
    ["table", 2],
    ["make", 1],
    ["tickets", 2],
    ["revenue", 3],
    ["attention", 3],
    ["conversion", 3],
    ["noticed", 2],
    ["difference", 3],
    ["the", 1],
    ["queue", 1],
    ["61%", 0],
  ])("%s has %i", (word, n) => {
    expect(syllables(word)).toBe(n);
  });
});

describe("readability", () => {
  it("is null for text too short to score honestly", () => {
    expect(readability("")).toBeNull();
    expect(readability("Short post here.")).toBeNull();
  });

  it("scores plain short sentences at a low grade", () => {
    const text =
      "Free users cost us more than they taught us. Not in money. In attention. So we killed it. We were wrong, and it cost us. Free is a plan. It is not a default.";
    const r = readability(text)!;
    expect(r.grade).toBeGreaterThanOrEqual(0);
    expect(r.grade).toBeLessThanOrEqual(4);
  });

  it("scores long, polysyllabic sentences much higher", () => {
    const text =
      "Organisational transformation initiatives necessitate comprehensive stakeholder alignment, continuous operational evaluation, and sophisticated communication methodologies throughout implementation. Consequently, leadership accountability frameworks increasingly emphasise measurable organisational outcomes.";
    expect(readability(text)!.grade).toBeGreaterThanOrEqual(16);
  });

  it("follows the Flesch-Kincaid grade formula", () => {
    // 2 sentences, 11 words, 20 syllables: 0.39 * 5.5 + 11.8 * 20 / 11 - 15.59 = 8.01
    const text = "Our revenue grew quickly after the change. Customers noticed the difference.";
    const r = readability(text)!;
    expect(r.words).toBe(11);
    expect(r.sentences).toBe(2);
    expect(r.syllables).toBe(20);
    expect(r.grade).toBe(8);
  });

  it("treats line breaks as sentence ends (LinkedIn posts rarely punctuate list lines)", () => {
    const r = readability("Support\n- 61% of tickets\n- 4% of revenue\nRoadmap\n- Features nobody paid for")!;
    expect(r.sentences).toBe(5);
  });

  it("never goes below zero", () => {
    expect(readability("Go now. Go now. Go now. Go now. Go now. Go now.")!.grade).toBe(0);
  });
});
