import { describe, expect, it } from "vitest";
import { isWritingRequest, learningGuard } from "./learning";

const KLEO_TEST_PROMPT =
  "Write one LinkedIn post for founders hiring their first engineer. No personal details, invented anecdotes or numbers. Just a test of the writing flow.";

describe("learningGuard", () => {
  it("never learns from the framing of a task: the Kleo case (a test prompt became a first-hire fact)", () => {
    const v = learningGuard(KLEO_TEST_PROMPT, ["Has hired their first engineer", "Is hiring their first engineer"]);
    expect(v.allowed).toEqual([]);
    expect(v.refused.map((r) => r.fact)).toHaveLength(2);
  });

  it("refuses the same fact from a plain writing request with no test marker", () => {
    const v = learningGuard("Draft a post for founders hiring their first engineer, skip personal details.", ["Has hired their first engineer"]);
    expect(v.allowed).toEqual([]);
    expect(v.refused[0]!.reason).toMatch(/writing request/);
  });

  it("refuses writing instructions even when the model phrases them as facts", () => {
    const v = learningGuard("I run a design studio. Draft a post about pricing.", ["Wants a post about pricing", "Asked to skip personal details", "Prefers no personal details for this post"]);
    expect(v.allowed).toEqual([]);
    expect(v.refused.every((r) => /instruction|writing request/.test(r.reason))).toBe(true);
  });

  it("keeps a first-person statement made inside a writing request", () => {
    const v = learningGuard("Write a post about pricing. I run a design studio in Pune with six people.", ["Runs a design studio in Pune with six people"]);
    expect(v.allowed).toEqual(["Runs a design studio in Pune with six people"]);
    const other = learningGuard("Write a post about pricing. I run a design studio in Pune.", ["Has hired their first engineer"]);
    expect(other.allowed).toEqual([]);
  });

  it("learns what the user says about themselves outside a writing request", () => {
    const v = learningGuard("I run a design studio in Pune and I always write in British English.", ["Runs a design studio in Pune", "Writes in British English"]);
    expect(v.allowed).toHaveLength(2);
  });

  it("honours an explicit remember, but not for test content", () => {
    expect(learningGuard("Remember that I never use hashtags.", ["Never uses hashtags"]).allowed).toEqual(["Never uses hashtags"]);
    expect(learningGuard("Draft a post. Remember that I never use hashtags.", ["Never uses hashtags"]).allowed).toEqual(["Never uses hashtags"]);
    expect(learningGuard("As a test, remember that I never use hashtags.", ["Never uses hashtags"]).allowed).toEqual([]);
  });

  it("does not store passing remarks", () => {
    const v = learningGuard("I might move to Lisbon someday, and I'm thinking about a newsletter.", ["Might move to Lisbon", "Is thinking about a newsletter"]);
    expect(v.allowed).toEqual([]);
    expect(v.refused.every((r) => r.reason === "a passing remark")).toBe(true);
    expect(learningGuard("Right now I am travelling this week.", ["Is travelling"]).allowed).toEqual([]);
  });

  it("ignores test content, samples and e2e markers", () => {
    for (const t of ["Pretend I am a baker.", "For example, imagine I run a bakery.", "Hello [e2e:needs-facts]", "This is a dummy sample."]) {
      expect(learningGuard(t, ["Is a baker"]).allowed, t).toEqual([]);
    }
  });
});

describe("isWritingRequest", () => {
  it("recognises writing requests and not statements", () => {
    for (const t of ["Draft a post about MVP vs POC", "Write 5 hook variations for a post about hiring", "Give me a few different opening lines for this post.", "can you write a post about pricing", "Rewrite this post from a different angle"]) {
      expect(isWritingRequest(t), t).toBe(true);
    }
    for (const t of ["I run a design studio in Pune.", "Remember that I prefer short paragraphs.", "What is my positioning?"]) {
      expect(isWritingRequest(t), t).toBe(false);
    }
  });
});
