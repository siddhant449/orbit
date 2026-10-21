import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button (drafting press, system.md section 5)", () => {
  it("plated variants are a static plate with a moving face child", () => {
    render(<Button>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveClass("btn", "btn--plated", "btn--primary", "btn--md");
    const face = button.querySelector(":scope > .btn__face");
    expect(face).not.toBeNull();
    expect(face).toHaveTextContent("Save changes");
  });

  it("generate is the same graphite plate as primary", () => {
    render(<Button variant="generate">Send</Button>);
    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("btn--plated", "btn--primary");
  });

  it("flat variants carry their content directly", () => {
    render(<Button variant="ghost">Cancel</Button>);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toHaveClass("btn--flat", "btn--ghost");
    expect(button.querySelector(".btn__face")).toBeNull();
  });

  it("danger is a signal frame, never hard-coded white or a plate", () => {
    render(<Button variant="danger">Delete profile</Button>);
    const button = screen.getByRole("button", { name: "Delete profile" });
    expect(button).toHaveClass("btn--flat", "btn--danger");
    expect(button.className).not.toMatch(/text-white|btn--plated/);
  });

  it("mirrors a keyboard press for 120 ms", () => {
    vi.useFakeTimers();
    render(<Button>Send</Button>);
    const button = screen.getByRole("button", { name: "Send" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(button).toHaveAttribute("data-pressed", "");
    vi.advanceTimersByTime(130);
    expect(button).not.toHaveAttribute("data-pressed");
    vi.useRealTimers();
  });
});
