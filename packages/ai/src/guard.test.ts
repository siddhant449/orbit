import { describe, expect, it } from "vitest";
import { looksLikeRefusal } from "./guard";

describe("looksLikeRefusal", () => {
  it.each([
    "I appreciate you testing my system, but I notice the input contains only random characters without any actual professional information to work with.",
    "To create an authentic first-person identity statement, I would need real details such as: your actual profession or role, specific areas of expertise, years of experience, key skills, notable achievements, or distinctive approaches you bring to your work.",
    "Could you provide genuine information about who you are professionally? Then I can craft a compelling and accurate identity statement that captures your essence.",
  ])("flags refusal: %s", (s) => {
    expect(looksLikeRefusal(s)).toBe(true);
  });

  it("flags other meta replies", () => {
    expect(looksLikeRefusal("As an AI, I cannot do that.")).toBe(true);
    expect(looksLikeRefusal("I can't help with that.")).toBe(true);
    expect(looksLikeRefusal("What do you do for a living?")).toBe(true);
  });

  it.each([
    "Left an agency last year to go solo.",
    "Runs a 6-person design studio in Pune.",
  ])("passes real facts: %s", (s) => {
    expect(looksLikeRefusal(s)).toBe(false);
  });
});
