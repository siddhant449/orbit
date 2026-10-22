import { describe, expect, it } from "vitest";
import { countOccurrences } from "./match";

describe("countOccurrences", () => {
  it("counts overlapping matches", () => {
    expect(countOccurrences("ha ha ha", "ha ha")).toBe(2);
    expect(countOccurrences("aaaa", "aa")).toBe(3);
    expect(countOccurrences("one two", "two")).toBe(1);
    expect(countOccurrences("one two", "three")).toBe(0);
    expect(countOccurrences("anything", "")).toBe(0);
  });
});
