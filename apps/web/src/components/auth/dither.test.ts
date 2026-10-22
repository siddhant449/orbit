import { describe, expect, it } from "vitest";
import { DITHER_SPEED, ditherColors, ditherSpeed, nextTheme, supportsWebGL2 } from "./dither";

describe("auth shader colours (system §2)", () => {
  it("dark: ground behind the accent fill", () => {
    expect(ditherColors("dark")).toEqual({ colorBack: "#0E0E10", colorFront: "#4F5FF5" });
  });

  it("light: paper ground behind the AA accent text blue", () => {
    expect(ditherColors("light")).toEqual({ colorBack: "#F5F4F0", colorFront: "#2E3FE6" });
  });

  it("unresolved or unknown theme falls back to the dark default", () => {
    expect(ditherColors(undefined)).toEqual(ditherColors("dark"));
    expect(ditherColors("sepia")).toEqual(ditherColors("dark"));
  });
});

describe("auth shader motion gating (ruling A19)", () => {
  it("runs slowly when motion is allowed and the tab is visible", () => {
    expect(DITHER_SPEED).toBeGreaterThan(0);
    expect(DITHER_SPEED).toBeLessThanOrEqual(0.2);
    expect(ditherSpeed({ reducedMotion: false, hidden: false })).toBe(DITHER_SPEED);
  });

  it("stops under prefers-reduced-motion", () => {
    expect(ditherSpeed({ reducedMotion: true, hidden: false })).toBe(0);
  });

  it("stops while the tab is hidden", () => {
    expect(ditherSpeed({ reducedMotion: false, hidden: true })).toBe(0);
  });
});

describe("theme toggle", () => {
  it("flips the resolved theme; before hydration it offers light (dark is the default)", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme(undefined)).toBe("light");
  });
});

describe("WebGL2 detection", () => {
  const doc = (ctx: unknown) => ({ createElement: () => ({ getContext: () => ctx }) }) as unknown as Document;

  it("true when a webgl2 context can be created", () => {
    expect(supportsWebGL2(doc({}))).toBe(true);
  });

  it("false when the context is null or creation throws", () => {
    expect(supportsWebGL2(doc(null))).toBe(false);
    const throwing = {
      createElement: () => ({
        getContext: () => {
          throw new Error("blocked");
        },
      }),
    } as unknown as Document;
    expect(supportsWebGL2(throwing)).toBe(false);
  });
});
