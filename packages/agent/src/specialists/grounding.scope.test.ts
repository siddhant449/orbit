import { describe, expect, it } from "vitest";
import { asksForNewMaterial, groundingScopeFor } from "./grounding";

describe("asksForNewMaterial", () => {
  it.each([
    "Add a number from my notes",
    "include a real example",
    "add a story about a client",
    "use a stat from the knowledge base",
    "back this up with data",
    "mention my experience hiring",
    "based on my research",
    "add a quote",
  ])("keeps the knowledge for %j", (t) => expect(asksForNewMaterial(t)).toBe(true));

  it.each([
    "Make the hook shorter",
    "make it punchier",
    "Shorten the first line",
    "Fix the grammar and remove the emoji",
    "Use a warmer tone",
    "End with a question",
    "Split the long paragraph",
  ])("does not for the plain edit %j", (t) => expect(asksForNewMaterial(t)).toBe(false));
});

describe("groundingScopeFor", () => {
  it("is light for a plain edit with nothing selected", () => {
    expect(groundingScopeFor({ text: "Make the hook shorter", knowledgeIds: [] })).toBe("light");
  });
  it("is full when the user selected knowledge, has research, or asks for new material", () => {
    expect(groundingScopeFor({ text: "Make it shorter", knowledgeIds: ["k1"] })).toBe("full");
    expect(groundingScopeFor({ text: "Make it shorter", knowledgeIds: [], research: "brief" })).toBe("full");
    expect(groundingScopeFor({ text: "Add a fact from my notes", knowledgeIds: [] })).toBe("full");
  });
});
