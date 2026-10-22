import { describe, expect, it } from "vitest";
import { summarizeParts } from "./transcript";

describe("summarizeParts", () => {
  it("lists tool calls in order with a short input and whether they worked, and joins the text", () => {
    const parts = [
      { type: "step-start" },
      { type: "tool-viewMemory", state: "output-available", input: { includeContents: true }, output: "# Memory\n..." },
      { type: "tool-delegateWriting", state: "output-available", input: { request: "x".repeat(500), specialty: "post" }, output: { specialist: "post-writing" } },
      { type: "tool-createDocument", state: "output-available", input: { title: "T" }, output: { error: "EXISTING_POST: nope" } },
      { type: "tool-readMemory", state: "output-error", input: { path: "a.md" }, errorText: "boom" },
      { type: "text", text: "Done. " },
      { type: "text", text: "Anything else?" },
    ];
    const s = summarizeParts(parts);
    expect(s.tools.map((t) => t.name)).toEqual(["viewMemory", "delegateWriting", "createDocument", "readMemory"]);
    expect(s.tools.map((t) => t.ok)).toEqual([true, true, false, false]);
    expect(s.tools[1]!.input.length).toBeLessThanOrEqual(300);
    expect(s.text).toBe("Done. Anything else?");
  });

  it("treats Failed:/Refused: strings as failures", () => {
    const s = summarizeParts([
      { type: "tool-saveMemory", state: "output-available", input: {}, output: "Refused: no" },
      { type: "tool-searchKB", state: "output-available", input: {}, output: "Failed: x" },
    ]);
    expect(s.tools.map((t) => t.ok)).toEqual([false, false]);
  });
});
