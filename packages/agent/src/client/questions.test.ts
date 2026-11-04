import { describe, expect, it } from "vitest";
import { formatAnswers, questionSetOf } from "./questions";

const part = (payload: Record<string, unknown>, state = "output-available") => ({ type: "tool-delegateWriting", state, toolCallId: "t1", output: { payload } });
const msg = (parts: unknown[], role = "assistant") => ({ role, parts });

describe("questionSetOf", () => {
  it("reads questions, dedupes, aligns and trims suggestions", () => {
    const set = questionSetOf([
      msg([part({ readiness: "needs-user-input", missingFacts: ["Who?", " who? ", "When?"], suggestions: [["A", "A", "B", "C", "D"], ["x".repeat(91), "ok"], ["third"]] })]),
    ]);
    expect(set?.toolCallId).toBe("t1");
    expect(set?.questions).toEqual([
      { text: "Who?", suggestions: ["A", "B", "C"] },
      { text: "When?", suggestions: ["third"] },
    ]);
  });
  it("caps at 5 questions", () => {
    const set = questionSetOf([msg([part({ readiness: "needs-user-input", missingFacts: ["1", "2", "3", "4", "5", "6", "7"] })])]);
    expect(set?.questions).toHaveLength(5);
  });
  it("is null when ready, unfinished, empty, or the user replied after", () => {
    expect(questionSetOf([msg([part({ readiness: "ready", missingFacts: [] })])])).toBeNull();
    expect(questionSetOf([msg([part({ readiness: "needs-user-input", missingFacts: ["q"] }, "input-available")])])).toBeNull();
    expect(questionSetOf([msg([part({ readiness: "needs-user-input", missingFacts: [] })])])).toBeNull();
    expect(questionSetOf([msg([part({ readiness: "needs-user-input", missingFacts: ["q"] })]), msg([{ type: "text", text: "hi" }], "user")])).toBeNull();
  });
});

describe("formatAnswers", () => {
  it("builds the single answers message", () => {
    expect(formatAnswers([{ text: "Q one?" }, { text: "Q two?" }], ["a1", " a2 "])).toBe("Here are my answers:\n\n1. Q one?\na1\n\n2. Q two?\na2");
  });
});
