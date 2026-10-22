import { describe, expect, it } from "vitest";
import { SPRINT_FORMATS, findSprintFormat, sprintDraftPrompt } from "./curriculum";

describe("sprint curriculum", () => {
  it("has one format for each of the up to 22 weekdays in 30 days", () => {
    expect(SPRINT_FORMATS).toHaveLength(22);
  });

  it("gives every format a unique slug id and title", () => {
    const ids = SPRINT_FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    const titles = SPRINT_FORMATS.map((f) => f.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("says what to write: a brief, three steps and an example opening line", () => {
    for (const f of SPRINT_FORMATS) {
      expect(f.title.trim().length).toBeGreaterThan(3);
      expect(f.title.length).toBeLessThanOrEqual(32);
      expect(f.brief.length).toBeGreaterThan(40);
      expect(f.brief.length).toBeLessThanOrEqual(180);
      expect(f.steps).toHaveLength(3);
      for (const s of f.steps) expect(s.trim().length).toBeGreaterThan(10);
      expect(f.example.trim().length).toBeGreaterThan(20);
    }
  });

  it("never names another product or a real person", () => {
    const text = JSON.stringify(SPRINT_FORMATS).toLowerCase();
    for (const banned of ["kleo", "linkedin", "justin", "welsh", "hormozi"]) expect(text).not.toContain(banned);
  });

  it("finds a format by id and refuses unknown ids", () => {
    expect(findSprintFormat(SPRINT_FORMATS[3]!.id)).toBe(SPRINT_FORMATS[3]);
    expect(findSprintFormat("nope")).toBeNull();
    expect(findSprintFormat(undefined)).toBeNull();
  });

  it("builds a chat prompt that carries the format, its steps and the day", () => {
    const f = SPRINT_FORMATS[0]!;
    const prompt = sprintDraftPrompt(f, 4);
    expect(prompt).toContain(f.title);
    expect(prompt).toContain("Day 4");
    for (const s of f.steps) expect(prompt).toContain(s);
    expect(sprintDraftPrompt(f)).not.toContain("Day ");
  });
});
