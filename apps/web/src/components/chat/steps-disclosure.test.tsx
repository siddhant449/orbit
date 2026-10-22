import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepsDisclosure } from "./steps-disclosure";

const done = (name: string) => ({ type: `tool-${name}`, state: "output-available", output: "✓ ok" });

describe("StepsDisclosure", () => {
  it("is a real button with aria-expanded, collapsed when the run is over", () => {
    const html = renderToStaticMarkup(<StepsDisclosure parts={[done("searchKB"), done("readKB")]} />);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).toContain("Worked through 2 steps");
    expect(html).toMatch(/aria-controls="[^"]+"/);
  });

  it("opens by default while a step runs, one row per step", () => {
    const html = renderToStaticMarkup(
      <StepsDisclosure parts={[done("searchKB"), { type: "tool-readKB", state: "input-available" }]} />,
    );
    expect(html).toMatch(/aria-expanded="true"/);
    expect(html.match(/data-tool-row=""/g)).toHaveLength(2);
    expect(html).toContain("Reading a knowledge item");
  });

  it("marks a failed step with its error label", () => {
    const html = renderToStaticMarkup(
      <StepsDisclosure parts={[{ type: "tool-saveMemory", state: "output-error", errorText: "x" }, { type: "tool-readKB", state: "input-available" }]} />,
    );
    expect(html).toMatch(/data-state="error"[^>]*>[\s\S]*Couldn&#x27;t save that/);
  });

  it("shows the duration when given", () => {
    expect(renderToStaticMarkup(<StepsDisclosure parts={[done("searchKB")]} durationMs={3100} />)).toContain("3.1s");
  });
});
