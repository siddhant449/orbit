import { describe, expect, it } from "vitest";
import { SPRINT_FORMATS } from "./curriculum";
import { PROMPT_MAX, sprintDraftHref } from "./links";
import { buildSprint } from "./plan";

const promptOf = (href: string) => new URL(href, "http://x").searchParams.get("prompt");

describe("sprint draft links", () => {
  it("prefills home with the day's own format and day number", () => {
    const sprint = buildSprint({ start: "2026-10-20", today: "2026-10-20", drafts: {} });
    const day = sprint.days[6]!; // Monday, day 7, fifth format
    const href = sprintDraftHref(day);
    expect(href.startsWith("/?prompt=")).toBe(true);
    const prompt = promptOf(href)!;
    expect(prompt).toContain("Day 7 of my 30-day sprint");
    expect(prompt).toContain(day.format!.title);
    expect(prompt).toContain(SPRINT_FORMATS[4]!.title);
  });

  it("links rest days to plain home", () => {
    const sprint = buildSprint({ start: "2026-10-20", today: "2026-10-20", drafts: {} });
    expect(sprintDraftHref(sprint.days[4]!)).toBe("/");
  });

  it("keeps every prompt within the home handoff cap", () => {
    for (const format of SPRINT_FORMATS) {
      const prompt = promptOf(sprintDraftHref({ day: 30, format }))!;
      expect([...prompt].length).toBeLessThanOrEqual(PROMPT_MAX);
    }
  });
});
