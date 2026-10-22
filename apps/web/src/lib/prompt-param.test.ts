import { describe, expect, it } from "vitest";
import { PROMPT_PARAM_MAX, promptParam } from "./prompt-param";

describe("promptParam", () => {
  it("returns the ?prompt= text, first value only, capped, and nothing for blanks", () => {
    expect(promptParam("Help me draft ")).toBe("Help me draft ");
    expect(promptParam(["a", "b"])).toBe("a");
    expect(promptParam(undefined)).toBeUndefined();
    expect(promptParam("   ")).toBeUndefined();
    expect(promptParam("x".repeat(PROMPT_PARAM_MAX + 50))).toHaveLength(PROMPT_PARAM_MAX);
  });
});
