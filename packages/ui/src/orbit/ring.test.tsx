import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Ring, ringGeometry } from "./ring";

describe("Ring (system §6.7)", () => {
  it("computes stroke-dashoffset = C × (1 − value/max)", () => {
    const { r, c, offset } = ringGeometry({ value: 2, max: 30, strokeWidth: 6 });
    expect(r).toBe(46);
    expect(c).toBeCloseTo(2 * Math.PI * 46, 6);
    expect(offset).toBeCloseTo(c * (1 - 2 / 30), 6);
  });

  it("clamps outside 0..max and treats max 0 as empty", () => {
    expect(ringGeometry({ value: 40, max: 30 }).offset).toBe(0);
    const empty = ringGeometry({ value: -3, max: 30 });
    expect(empty.offset).toBeCloseTo(empty.c, 6);
    const none = ringGeometry({ value: 1, max: 0 });
    expect(none.offset).toBeCloseTo(none.c, 6);
  });

  it("renders the progress arc with that offset and exposes its label", () => {
    render(<Ring value={2} max={30} label="Sprint progress" />);
    const img = screen.getByRole("img", { name: "Sprint progress, 2 of 30" });
    const bar = img.querySelector("[data-ring-bar]")!;
    const { c, offset } = ringGeometry({ value: 2, max: 30 });
    expect(Number(bar.getAttribute("stroke-dasharray"))).toBeCloseTo(c, 3);
    expect(Number(bar.getAttribute("stroke-dashoffset"))).toBeCloseTo(offset, 3);
  });

  it("renders centred content as decoration (the label carries the meaning)", () => {
    render(
      <Ring value={2} max={30} label="Sprint progress" size={52}>
        2
      </Ring>,
    );
    const img = screen.getByRole("img", { name: "Sprint progress, 2 of 30" });
    expect(img).toHaveStyle({ width: "52px", height: "52px" });
    expect(img).toHaveTextContent("2");
  });
});
