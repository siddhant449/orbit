import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CountUp, countUpSeen } from "./count-up";

describe("CountUp (system §6.8)", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps the final value in the DOM for screen readers and hides the animated copy", () => {
    render(<CountUp value={412118} format={(n) => n.toLocaleString("en-US")} />);
    expect(screen.getByText("412,118", { selector: ".sr-only" })).toBeInTheDocument();
    expect(document.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("counts up only on the first view per session for a keyed metric", () => {
    expect(countUpSeen("followers")).toBe(false);
    expect(countUpSeen("followers")).toBe(true);
    expect(countUpSeen("impressions")).toBe(false);
  });
});
