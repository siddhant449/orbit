import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button (riso press, section 5.1)", () => {
  it("plated variants are a static plate with a moving face child", () => {
    render(<Button>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveClass("btn", "btn--plated", "btn--primary", "btn--md");
    const face = button.querySelector(":scope > .btn__face");
    expect(face).not.toBeNull();
    expect(face).toHaveTextContent("Save changes");
  });

  it("flat variants carry their content directly", () => {
    render(<Button variant="ghost">Cancel</Button>);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveClass("btn--flat", "btn--ghost");
    expect(button.querySelector(".btn__face")).toBeNull();
  });

  it("danger uses the on-danger token, never hard-coded white", () => {
    render(<Button variant="danger">Delete profile</Button>);
    const button = screen.getByRole("button", { name: "Delete profile" });
    expect(button).toHaveClass("btn--danger");
    expect(button.className).not.toMatch(/text-white/);
  });

  it("mirrors a keyboard press for 120 ms", () => {
    vi.useFakeTimers();
    render(<Button variant="generate">Send</Button>);
    const button = screen.getByRole("button", { name: "Send" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(button).toHaveAttribute("data-pressed", "");
    vi.advanceTimersByTime(130);
    expect(button).not.toHaveAttribute("data-pressed");
    vi.useRealTimers();
  });

  it("secondary records the pointer's entry point for the ink soak", () => {
    render(<Button variant="secondary">Import memories</Button>);
    const button = screen.getByRole("button", { name: "Import memories" });
    button.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerEnter(button, { clientX: 50, clientY: 10 });
    expect(button.style.getPropertyValue("--soak-x")).toBe("25.0%");
    expect(button.style.getPropertyValue("--soak-y")).toBe("25.0%");
  });
});
