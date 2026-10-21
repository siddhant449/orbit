import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { hasReducedMotionListener } from "motion/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { durations, easeExit, easeInk, springLayout, springPress, stampVariants, useMotionSafe } from "./presets";

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

describe("presets (micro-interactions.md section 0)", () => {
  it("springPress is the spring-press object", () => {
    expect(springPress).toEqual({ type: "spring", stiffness: 500, damping: 30, mass: 1 });
  });

  it("springLayout is the spring-layout object", () => {
    expect(springLayout).toEqual({ type: "spring", stiffness: 380, damping: 36 });
  });

  it("durations are the named durations in seconds", () => {
    expect(durations.entry).toBe(0.18);
    expect(durations).toEqual({ hover: 0.2, entry: 0.18, exit: 0.12, draw: 0.4, settle: 0.24, loop: 1.2 });
  });

  it("eases are the ease-ink and ease-exit curves", () => {
    expect(easeInk).toEqual([0.2, 0.7, 0.2, 1]);
    expect(easeExit).toEqual([0.4, 0, 0.8, 0.4]);
  });

  it("stampVariants fade and scale in from .96 and fade out", () => {
    expect(stampVariants).toEqual({
      initial: { opacity: 0, scale: 0.96 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0 },
    });
  });
});

describe("useMotionSafe", () => {
  beforeEach(() => {
    // motion caches the media query result at module level; clear it so each test re-reads the mock.
    hasReducedMotionListener.current = false;
  });

  it("is false when the user prefers reduced motion", () => {
    mockReducedMotion(true);
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    render(createElement(Probe));
    expect(screen.getByTestId("safe")).toHaveTextContent("false");
  });

  it("is true when the user has no motion preference", () => {
    mockReducedMotion(false);
    render(createElement(Probe));
    expect(screen.getByTestId("safe")).toHaveTextContent("true");
  });
});
