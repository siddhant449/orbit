import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryTag, memoryTagOf } from "./memory-tag";

const out = (type: string, input: unknown, output: unknown) => ({ type, state: "output-available", input, output });

describe("memoryTagOf", () => {
  it("names the area and the change for a saved fact", () => {
    expect(memoryTagOf(out("tool-saveMemory", { category: "writing_rules", topic: null, facts: ["a"] }, "✓ Updated writing_rules with 1 item"))).toEqual({
      area: "Writing rules",
      change: "1 item added",
    });
    expect(memoryTagOf(out("tool-saveMemory", { category: "about", topic: null, facts: ["a", "b"] }, "✓ Updated about with 2 items (1 refused)"))).toEqual({
      area: "About you",
      change: "2 items added",
    });
  });

  it("uses the topic's own name for a topic", () => {
    expect(memoryTagOf(out("tool-saveMemory", { category: "topic", topic: "Design systems", facts: ["a"] }, "✓ Updated topic with 1 item"))?.area).toBe(
      "Design systems",
    );
  });

  it("reports a duplicate as already saved", () => {
    expect(memoryTagOf(out("tool-saveMemory", { category: "story", topic: null, facts: ["a"] }, "✓ Already saved: nothing new for story"))).toEqual({
      area: "Your story",
      change: "Already saved",
    });
  });

  it("reads an edit's area from its path, and an empty replace as a removal", () => {
    expect(memoryTagOf(out("tool-editMemory", { path: "writing/rules.md", find: "a", replace: "b" }, "✓ Updated writing/rules.md (memory version 3)"))).toEqual({
      area: "Writing rules",
      change: "Updated",
    });
    expect(memoryTagOf(out("tool-editMemory", { path: "identity/personal.md", find: "a", replace: "" }, "✓ Updated identity/personal.md (memory version 4)"))).toEqual({
      area: "Personal",
      change: "Removed",
    });
  });

  it("is null for failures, unfinished calls and other tools", () => {
    expect(memoryTagOf(out("tool-saveMemory", { category: "about" }, "Refused: identity/about.md can't be changed from chat."))).toBeNull();
    expect(memoryTagOf({ type: "tool-saveMemory", state: "input-available", input: { category: "about" } })).toBeNull();
    expect(memoryTagOf(out("tool-searchKB", {}, "✓ ok"))).toBeNull();
  });
});

describe("MemoryTag", () => {
  it("renders 'Area · change' as a link to the memory screen", () => {
    const html = renderToStaticMarkup(<MemoryTag area="Writing rules" change="1 item added" />);
    expect(html).toContain('href="/settings/memories"');
    expect(html).toContain("Writing rules · 1 item added");
    expect(html).toContain("data-memory-tag");
  });
});
