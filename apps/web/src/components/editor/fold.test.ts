import { describe, expect, it } from "vitest";
import { FOLD_CHARS, foldPoint, hookOf } from "./fold";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("foldPoint", () => {
  it("is 210 characters", () => {
    expect(FOLD_CHARS).toBe(210);
  });

  it("is null when the whole post shows", () => {
    expect(foldPoint("")).toBeNull();
    expect(foldPoint("a".repeat(210))).toBeNull();
  });

  it("snaps back to the last space at or before 210 characters", () => {
    const text = words(60);
    const at = foldPoint(text)!;
    expect(at).toBeLessThanOrEqual(210);
    expect(text[at]).toBe(" ");
    expect(text.slice(at + 1)).toMatch(/^word\d+/);
    expect(text.slice(0, at).length).toBeGreaterThan(200);
  });

  it("prefers a line break near the fold", () => {
    const text = `${"a".repeat(180)}\n${"b ".repeat(80)}`;
    expect(foldPoint(text)).toBe(180);
  });

  it("cuts at 210 when there is no break to snap to", () => {
    expect(foldPoint("x".repeat(400))).toBe(210);
  });

  it("does not snap back further than a short word", () => {
    // A single space at 20, then an unbroken run: snapping would hide most of the hook.
    expect(foldPoint(`${"a".repeat(20)} ${"b".repeat(400)}`)).toBe(210);
  });
});

describe("hookOf", () => {
  it("is the visible part above the fold, trimmed", () => {
    const text = words(60);
    expect(hookOf(text)).toBe(text.slice(0, foldPoint(text)!).trimEnd());
    expect(hookOf("Short post.\n")).toBe("Short post.");
  });
});
