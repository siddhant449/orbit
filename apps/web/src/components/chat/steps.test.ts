import { describe, expect, it } from "vitest";
import { formatDuration, summarizeSteps } from "./steps";

const done = (name: string) => ({ type: `tool-${name}`, state: "output-available", output: "✓ ok" });
const active = (name: string) => ({ type: `tool-${name}`, state: "input-available" });
const failed = (name: string) => ({ type: `tool-${name}`, state: "output-error", errorText: "boom" });

describe("summarizeSteps", () => {
  it("counts the steps and words the summary in the singular and plural", () => {
    expect(summarizeSteps([done("searchKB")]).summary).toBe("Worked through 1 step");
    expect(summarizeSteps([done("searchKB"), done("readKB")]).summary).toBe("Worked through 2 steps");
  });

  it("gives each step its label for its state", () => {
    const s = summarizeSteps([done("searchKB"), active("readKB"), failed("saveMemory")]);
    expect(s.steps).toEqual([
      { label: "Searched your knowledge", state: "done", detail: null },
      { label: "Reading a knowledge item", state: "active", detail: null },
      { label: "Couldn't save that", state: "error", detail: null },
    ]);
  });

  it("is live while any step runs and names the running one", () => {
    const s = summarizeSteps([done("searchKB"), active("readKB")]);
    expect(s.live).toBe(true);
    expect(s.current).toBe("Reading a knowledge item");
    expect(summarizeSteps([done("searchKB")]).live).toBe(false);
    expect(summarizeSteps([done("searchKB")]).current).toBeNull();
  });

  it("counts failures, and a string error output is a failure", () => {
    const s = summarizeSteps([failed("searchKB"), { type: "tool-readKB", state: "output-available", output: "Failed: nope" }, done("x")]);
    expect(s.failed).toBe(2);
  });

  it("reads dynamic tools by their tool name", () => {
    expect(summarizeSteps([{ type: "dynamic-tool", toolName: "web_search", state: "output-available", output: {} }]).steps[0]!.label).toBe(
      "Searched the web",
    );
  });

  it("carries a formatted duration only when one is known", () => {
    expect(summarizeSteps([done("searchKB")]).duration).toBeNull();
    expect(summarizeSteps([done("searchKB")], 3140).duration).toBe("3.1s");
  });
});

describe("formatDuration", () => {
  it("shows tenths under a minute and minutes with seconds above", () => {
    expect(formatDuration(40)).toBe("0.1s");
    expect(formatDuration(3140)).toBe("3.1s");
    expect(formatDuration(59_960)).toBe("1m 00s");
    expect(formatDuration(65_000)).toBe("1m 05s");
  });

  it("returns null for nothing measurable", () => {
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });

  it("shows what the polish pass did on a finished writing step", () => {
    const part = { type: "tool-delegateWriting", state: "output-available", output: { findings: ["Rule check (target): x", "Polished: fixed 2 layout issues"] } };
    expect(summarizeSteps([part]).steps[0]!.detail).toBe("Polished: fixed 2 layout issues");
    expect(summarizeSteps([{ ...part, output: { findings: [] } }]).steps[0]!.detail).toBeNull();
    expect(summarizeSteps([{ ...part, type: "tool-searchKB" }]).steps[0]!.detail).toBeNull();
  });
});
