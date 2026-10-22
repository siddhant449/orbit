import { describe, expect, it } from "vitest";
import { stripCitations } from "./sanitize";

describe("stripCitations", () => {
  it("removes the bare marker", () => {
    expect(stripCitations("Growth is up 40% citeturn1view2 this year.")).toBe("Growth is up 40% this year.");
  });
  it("removes private-use delimited and chained markers", () => {
    expect(stripCitations("Upciteturn1view2turn3search0.")).toBe("Up.");
    expect(stripCitations("A citeturn1view2turn0news1.")).toBe("A.");
  });
  it("keeps real URLs and plain text", () => {
    const t = "Read https://example.com/cite/turn1 now";
    expect(stripCitations(t)).toBe(t);
    expect(stripCitations("a\n\nb")).toBe("a\n\nb");
  });
});

describe("stripCitations: stored draft characters", () => {
  it("removes U+E200 cite U+E202 turn1view2 U+E201 exactly as stored", () => {
    const stored = "approvals. citeturn1view2\n\nTool-building";
    expect(stripCitations(stored)).toBe("approvals.\n\nTool-building");
  });
});
