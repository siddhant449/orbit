import { describe, expect, it } from "vitest";
import { openPanelOf, panelsOf, parseOptionsPanel } from "./options";

const output = {
  shown: true,
  preamble: "Intro.",
  question: "Which angle?",
  options: [
    { id: "a", label: "Alpha", explainer: "one" },
    { id: "b", label: "Beta", explainer: "two" },
  ],
  recommendedOptionId: "b",
  allowFreeInput: true,
  freeInputPlaceholder: "Or tell me something else…",
};
const part = { type: "tool-presentOptions", toolCallId: "c1", state: "output-available", output };
const asst = { role: "assistant", parts: [part] };
const user = (text: string, optionPick?: object) => ({ role: "user", parts: [{ type: "text", text }], metadata: optionPick ? { optionPick } : {} });

describe("options panel", () => {
  it("parses a finished call and rejects partial or malformed ones", () => {
    expect(parseOptionsPanel(part)?.options).toHaveLength(2);
    expect(parseOptionsPanel({ ...part, state: "input-available" })).toBeNull();
    expect(parseOptionsPanel({ ...part, output: { shown: true, question: "q", options: [{ id: "a", label: "x", explainer: "y" }] } })).toBeNull();
  });

  it("is open until a user message follows, then answers with the picked label", () => {
    expect(openPanelOf([user("create a post on llm"), asst])?.pickerToolCallId).toBe("c1");
    const picked = [user("hi"), asst, user("Beta", { pickerToolCallId: "c1", optionId: "b" })];
    expect(openPanelOf(picked)).toBeNull();
    expect(panelsOf(picked, 1)[0]?.answer).toBe("Beta");
  });

  it("treats typed text as the answer", () => {
    expect(panelsOf([user("hi"), asst, user("Make it about cost")], 1)[0]?.answer).toBe("Make it about cost");
  });
});

import { matchTypedAnswer } from "./options";

describe("matchTypedAnswer", () => {
  const opts = [
    { id: "i1", label: "Why we cut onboarding from nine steps to four" },
    { id: "i2", label: "A flat price beat tiers in our test" },
    { id: "i3", label: "Hiring a designer before an engineer" },
    { id: "i4", label: "What overpromising a deadline cost us" },
    { id: "i5", label: "Skills matter more than credentials" },
  ];
  it.each([
    ["2", "i2"], ["#2", "i2"], ["2nd", "i2"], ["second", "i2"], ["Second one", "i2"], ["the second one", "i2"], ["option 2", "i2"],
    ["idea 2", "i2"], ["Idea two", "i2"], ["number 3", "i3"], ["I'll go with the 4th", "i4"], ["pick 5", "i5"], ["last one", "i5"], ["the first", "i1"],
  ])("reads %s as an ordinal", (text, id) => expect(matchTypedAnswer(opts, text)).toBe(id));
  it("reads out-of-range ordinals as nothing", () => {
    expect(matchTypedAnswer(opts, "6")).toBeNull();
    expect(matchTypedAnswer(opts, "sixth")).toBeNull();
    expect(matchTypedAnswer(opts, "0")).toBeNull();
  });
  it("matches a unique label by substring or token overlap", () => {
    expect(matchTypedAnswer(opts, "flat price beat tiers")).toBe("i2");
    expect(matchTypedAnswer(opts, "skills matter more than credentials")).toBe("i5");
    expect(matchTypedAnswer(opts, "the hiring a designer one")).toBe("i3");
  });
  it("leaves ambiguous and unrelated text as the user's own answer", () => {
    expect(matchTypedAnswer([{ id: "a", label: "Cost of hiring" }, { id: "b", label: "Cost of firing" }], "cost of")).toBeNull();
    expect(matchTypedAnswer(opts, "Make it about the cost of tools, with a draft")).toBeNull();
    expect(matchTypedAnswer(opts, "give me some angles")).toBeNull();
    expect(matchTypedAnswer(opts, "ok")).toBeNull();
  });
});
