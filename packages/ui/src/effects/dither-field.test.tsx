import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DitherField } from "./dither-field";

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("DitherField (C4)", () => {
  it("renders a static tile and no canvas under reduced motion", () => {
    mockReducedMotion(true);
    const { container } = render(createElement(DitherField));
    const host = container.firstElementChild!;
    expect(host).toHaveAttribute("aria-hidden", "true");
    expect(host).toHaveClass("dither--static");
    expect(host.hasAttribute("data-dither")).toBe(false);
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("marks the live field and survives a missing 2D context", () => {
    mockReducedMotion(false);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    // jsdom has no canvas: getContext returns null, so the field must degrade to an empty decorative box.
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(createElement(DitherField));
    const host = container.firstElementChild!;
    expect(host).toHaveAttribute("data-dither", "");
    expect(host).not.toHaveClass("dither--static");
    expect(container.querySelector("canvas")).toBeNull();
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});
