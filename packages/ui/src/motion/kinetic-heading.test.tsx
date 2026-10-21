import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KineticHeading } from "./kinetic-heading";

const TEXT = "What are we writing today?";

describe("KineticHeading (C2)", () => {
  it("keeps the exact accessible name while the letters are split", () => {
    render(<KineticHeading text={TEXT} lines={["What are we", "writing today?"]} narrowLines={["What are", "we writing", "today?"]} />);
    const heading = screen.getByRole("heading", { level: 1, name: TEXT });
    expect(heading).toHaveAttribute("aria-label", TEXT);
    // Three layers (ink, pink, blue), every one hidden from assistive tech, each with one span per letter.
    const layers = heading.querySelectorAll(":scope > .kinetic__layer");
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      expect(layer).toHaveAttribute("aria-hidden", "true");
      expect(layer.querySelectorAll(".kinetic__letter")).toHaveLength(TEXT.replace(/ /g, "").length);
      expect(layer.textContent).toBe(TEXT);
    }
  });

  it("numbers the letters for the stagger and breaks lines where asked", () => {
    render(<KineticHeading text={TEXT} lines={["What are we", "writing today?"]} narrowLines={["What are", "we writing", "today?"]} delay={200} />);
    const heading = screen.getByRole("heading", { level: 1 });
    const letters = heading.querySelectorAll(".kinetic__layer:first-child .kinetic__letter");
    expect((letters[0] as HTMLElement).style.getPropertyValue("--i")).toBe("0");
    expect((letters[letters.length - 1] as HTMLElement).style.getPropertyValue("--i")).toBe(String(letters.length - 1));
    expect(heading.style.getPropertyValue("--kinetic-delay")).toBe("200ms");
    expect(heading.querySelectorAll(".kinetic__layer:first-child .kinetic__br--wide")).toHaveLength(1);
    expect(heading.querySelectorAll(".kinetic__layer:first-child .kinetic__br--narrow")).toHaveLength(2);
  });

  it("refuses lines that do not spell the text", () => {
    expect(() => render(<KineticHeading text={TEXT} lines={["What are", "we"]} />)).toThrow(/spell/);
  });
});
