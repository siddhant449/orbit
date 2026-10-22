import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { measurePost } from "@brandloop/agent/client";
import { LayoutReadout, readoutChips } from "./layout-readout";

const labels = (text: string) => readoutChips(measurePost(text)).map((c) => c.label);

describe("layout readout", () => {
  it("says a one-line hook fits before see more", () => {
    expect(labels("Short hook here.\n\nBody line.")).toEqual(["Hook · 1 line on mobile", "2 blocks", "Fits before see more"]);
  });

  it("shows List only when the post has one", () => {
    expect(labels("Hook.\n\nSteps:\n- a\n- b\n\nEnd.")).toContain("List");
    expect(labels("Hook.\n\nEnd.")).not.toContain("List");
  });

  it("warns when the promise is after the fold", () => {
    expect(labels(`${"word ".repeat(60).trim()}\n\nNext.`)).toContain("Promise is after the fold");
  });

  it("renders a group named Post layout, and nothing for an empty post", () => {
    const html = renderToStaticMarkup(<LayoutReadout text={"Hook.\n\nBody."} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Post layout"');
    expect(renderToStaticMarkup(<LayoutReadout text="  " />)).toBe("");
  });
});
