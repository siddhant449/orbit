import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LineReveal } from "./line-reveal";

describe("LineReveal (system §7)", () => {
  it("keeps textContent equal to the full heading, once", () => {
    render(<LineReveal as="h1" lines={["Good evening.", "What are we putting out there?"]} />);
    const heading = screen.getByRole("heading", { level: 1, name: "Good evening. What are we putting out there?" });
    expect(heading.textContent).toBe("Good evening. What are we putting out there?");
  });

  it("renders one clip-masked line per entry with a stagger index", () => {
    const { container } = render(<LineReveal as="h2" lines={["One", "Two", "Three"]} className="type-section" />);
    const h2 = container.querySelector("h2")!;
    expect(h2).toHaveClass("type-section", "line-reveal");
    const lines = h2.querySelectorAll(".line-reveal__line");
    expect(lines).toHaveLength(3);
    expect((lines[2]!.firstElementChild as HTMLElement).style.getPropertyValue("--i")).toBe("2");
  });
});
