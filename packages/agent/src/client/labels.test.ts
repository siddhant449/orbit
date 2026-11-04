import { describe, expect, it } from "vitest";
import { needsUserInput } from "./labels";

describe("needsUserInput", () => {
  it("is true only for a delegateWriting handoff asking for details", () => {
    expect(needsUserInput("delegateWriting", { payload: { readiness: "needs-user-input" } })).toBe(true);
    expect(needsUserInput("delegateWriting", { payload: { readiness: "ready" } })).toBe(false);
    expect(needsUserInput("delegateWriting", "Failed: x")).toBe(false);
    expect(needsUserInput("researchTopic", { payload: { readiness: "needs-user-input" } })).toBe(false);
  });
});
