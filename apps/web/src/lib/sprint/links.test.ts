import { describe, expect, it } from "vitest";
import { SPRINT_FORMATS } from "./curriculum";
import { sprintDraftHref, sprintPromptFromQuery } from "./links";

describe("sprint draft links", () => {
  const f = SPRINT_FORMATS[1]!;

  it("round-trips a format and day through the home link", () => {
    const href = sprintDraftHref(f.id, 2);
    expect(href).toBe(`/?draft=${f.id}&day=2`);
    const query = Object.fromEntries(new URL(href, "http://x").searchParams);
    const prompt = sprintPromptFromQuery(query)!;
    expect(prompt).toContain(f.title);
    expect(prompt).toContain("Day 2");
  });

  it("ignores unknown formats and out-of-range days", () => {
    expect(sprintPromptFromQuery({ draft: "made-up" })).toBeNull();
    expect(sprintPromptFromQuery({})).toBeNull();
    expect(sprintPromptFromQuery({ draft: [f.id] })).toBeNull();
    expect(sprintPromptFromQuery({ draft: f.id, day: "99" })).not.toContain("Day 99");
    expect(sprintDraftHref(f.id)).toBe(`/?draft=${f.id}`);
  });
});
