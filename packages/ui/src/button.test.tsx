import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

const variants = ["primary", "secondary", "ghost", "danger", "generate", "paper", "inverse", "micro", "send"] as const;

describe("Button (Orbit, system §6.3)", () => {
  it.each(variants)("%s renders one element carrying its content directly (no btn__face)", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.children).toHaveLength(0);
    expect(button.textContent).toBe("Go");
    expect(button.querySelector(".btn__face")).toBeNull();
    expect(button.className).not.toMatch(/btn--plated|btn__face/);
  });

  it("primary and generate are the same accent fill", () => {
    render(
      <>
        <Button>Save</Button>
        <Button variant="generate">Send</Button>
      </>,
    );
    const save = screen.getByRole("button", { name: "Save" });
    const send = screen.getByRole("button", { name: "Send" });
    expect(save).toHaveClass("bg-accent", "text-on-accent", "rounded-pill");
    expect(send).toHaveClass("bg-accent", "text-on-accent");
  });

  it("danger is a neutral pill with danger text, never a fill", () => {
    render(<Button variant="danger">Delete profile</Button>);
    const button = screen.getByRole("button", { name: "Delete profile" });
    expect(button).toHaveClass("text-danger");
    expect(button.className).not.toMatch(/bg-danger|text-white/);
  });

  it("sizes: lg is the 52 px CTA, icon is a 40 px circle", () => {
    render(
      <>
        <Button size="lg">Get started</Button>
        <Button size="icon" variant="secondary" aria-label="Add" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Get started" })).toHaveClass("min-h-[52px]");
    expect(screen.getByRole("button", { name: "Add" })).toHaveClass("size-10", "rounded-full");
  });

  it("asChild renders the child element with the button classes", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/posts">Posts</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Posts" });
    expect(link).toHaveClass("rounded-pill");
    expect(link.children).toHaveLength(0);
  });
});
