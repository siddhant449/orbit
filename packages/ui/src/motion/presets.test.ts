import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { hasReducedMotionListener } from "motion/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { distance, durations, easeInk, easeOut, springLayout, springMagnet, stagger, useMotionSafe } from "./presets";

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

function Probe() {
  const safe = useMotionSafe();
  return createElement("output", { "data-testid": "safe" }, String(safe));
}

describe("presets (Orbit, system §7.1)", () => {
  it("one easing everywhere: out-expo", () => {
    expect(easeOut).toEqual([0.16, 1, 0.3, 1]);
  });

  it("durations, staggers and distances", () => {
    expect(durations).toEqual({ hoverColor: 0.15, hover: 0.4, reveal: 0.9, line: 1.2 });
    expect(stagger).toEqual({ line: 0.08, panel: 0.12 });
    expect(distance).toEqual({ button: 2, panel: 8, reveal: 18 });
  });

  it("springs: magnetic CTA and layout moves", () => {
    expect(springMagnet).toEqual({ type: "spring", stiffness: 300, damping: 24 });
    expect(springLayout).toEqual({ type: "spring", stiffness: 380, damping: 36 });
  });

  it("deprecated easeInk aliases easeOut until O4", () => {
    expect(easeInk).toBe(easeOut);
  });
});

describe("useMotionSafe", () => {
  beforeEach(() => {
    hasReducedMotionListener.current = false;
  });

  it("is false when the user prefers reduced motion", () => {
    mockReducedMotion(true);
    render(createElement(Probe));
    expect(screen.getByTestId("safe")).toHaveTextContent("false");
  });

  it("is true when the user has no motion preference", () => {
    mockReducedMotion(false);
    render(createElement(Probe));
    expect(screen.getByTestId("safe")).toHaveTextContent("true");
  });
});
