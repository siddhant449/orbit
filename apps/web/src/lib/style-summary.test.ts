import { describe, expect, it } from "vitest";
import { PRESET_VOICES } from "../../../../packages/db/prisma/presets";
import { layoutLine, pickReferencePost } from "./style-summary";

describe("style summary", () => {
  it("writes the measured layout in one line", () => {
    for (const p of PRESET_VOICES) expect(layoutLine(p.profile.layout)).toMatch(/^Hooks ~\d+ characters · \d+–\d+ blocks · (lists in \d+% of posts|no lists)$/);
  });

  it("says no lists for a style without any", () => {
    const priya = PRESET_VOICES.find((p) => p.slug === "priya-lindqvist")!;
    expect(layoutLine(priya.profile.layout)).toContain("no lists");
  });

  it("picks the reference post nearest the typical length", () => {
    const p = PRESET_VOICES[0]!.profile;
    const ref = pickReferencePost(p);
    const target = p.layout.postChars.typical;
    const gaps = p.referencePosts.map((r) => Math.abs(r.text.length - target));
    expect(Math.abs(ref.text.length - target)).toBe(Math.min(...gaps));
  });
});
