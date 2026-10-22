import { describe, expect, it } from "vitest";
import type { StyleProfile } from "@brandloop/ai";
import { DEFAULT_TARGETS, resolveRules } from "./rules";
import { renderStyleBlock } from "./inject";

const dd = (t: string) => ({ do: [`Do ${t} well`], dont: [`Avoid ${t} mess`] });
const profile: StyleProfile = {
  schemaVersion: 1,
  language: "en-GB",
  voiceTarget: "Write as a calm, plain-spoken founder.",
  rules: { hooks: dd("hooks"), rhythm: dd("rhythm"), formatting: dd("formatting"), diction: dd("diction"), closings: dd("closings"), global: dd("global") },
  signatureMoves: [
    { label: "Postscript nudge", pattern: "P.S. [one-line offer]", useWhen: "the post teaches" },
    { label: "Flat rule", pattern: "[Rule]. [Why].", useWhen: "closing" },
  ],
  finalChecks: ["Is the hook short?"],
  layout: { ...DEFAULT_TARGETS, postscriptPercent: 76, emoji: { perPost: 2, positions: ["cta"] } },
  referencePosts: [
    { text: "REFERENCE-LONG " + "word ".repeat(120), postType: "story", note: "n" },
    { text: "REFERENCE-SHORT one two three.", postType: "how-to", note: "n" },
    { text: "REFERENCE-MID " + "word ".repeat(30), postType: "story", note: "n" },
  ],
  source: { kind: "own", postCount: 20, corpusHash: "h", compiledAt: "2026-10-22T00:00:00.000Z", model: null },
};
const rules = (md = "") => resolveRules({ userRulesMarkdown: md, style: profile, turn: {} });

describe("renderStyleBlock", () => {
  it("puts hard rules, layout and the voice target first", () => {
    const b = renderStyleBlock(profile, rules("- No emojis\n- Never add a P.S."), { postType: null, budget: 7_000 });
    expect(b.indexOf("No emoji")).toBeGreaterThanOrEqual(0);
    expect(b.indexOf("No emoji")).toBeLessThan(b.indexOf("calm, plain-spoken"));
    expect(b.indexOf("calm, plain-spoken")).toBeLessThan(b.indexOf("Do hooks well"));
    expect(b).toMatch(/Hook:/);
  });

  it("keeps the style block within budget, hard rules and layout first, references last", () => {
    const small = renderStyleBlock(profile, rules("- No emojis"), { postType: null, budget: 1_000 });
    expect(small.length).toBeLessThanOrEqual(1_000);
    expect(small).toContain("No emoji");
    expect(small).toMatch(/Hook:/);
    expect(small).not.toContain("REFERENCE-");
    const full = renderStyleBlock(profile, rules(), { postType: null, budget: 7_000 });
    expect(full).toContain("REFERENCE-");
    expect(full.length).toBeLessThanOrEqual(7_000);
  });

  it("never injects a dropped style rule", () => {
    const b = renderStyleBlock(profile, rules("- Never add a P.S.\n- No emojis"), { postType: null, budget: 7_000 });
    expect(b).not.toContain("Postscript nudge");
    expect(b).not.toContain("one-line offer");
    expect(b).toContain("Flat rule");
  });

  it("picks reference posts matching the post type first, then the shortest", () => {
    const b = renderStyleBlock(profile, rules(), { postType: "how-to", budget: 7_000 });
    expect(b.indexOf("REFERENCE-SHORT")).toBeGreaterThanOrEqual(0);
    const noType = renderStyleBlock(profile, rules(), { postType: null, budget: 7_000 });
    expect(noType.indexOf("REFERENCE-SHORT")).toBeLessThan(noType.indexOf("REFERENCE-MID"));
    expect(noType).not.toContain("REFERENCE-LONG");
  });

  it("reports a one-turn override", () => {
    const r = resolveRules({ userRulesMarkdown: "- No emojis", style: profile, turn: { allowEmoji: true } });
    expect(renderStyleBlock(profile, r, { postType: null, budget: 7_000 })).toMatch(/this turn.*emoji/i);
  });

  it("falls back to the legacy guide when there is no profile", () => {
    const b = renderStyleBlock(null, resolveRules({ userRulesMarkdown: "- No emojis", style: null, turn: {} }), { postType: null, budget: 7_000, legacyGuide: "## Rhythm\n- short lines" });
    expect(b).toContain("short lines");
    expect(b).toContain("No emoji");
  });
});
