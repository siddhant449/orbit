/**
 * Pure rules for the sign-in / sign-up shader panel (ruling A19). Kept free of React and WebGL so they unit-test in node.
 */

/** Slow drift: a full light orbit around the sphere takes well over a minute. */
export const DITHER_SPEED = 0.12;

export type DitherColors = { colorBack: string; colorFront: string };

/** Dark: ground + accent fill. Light: paper ground + accent text blue (system §2.1, §2.3). Unknown → dark default. */
export function ditherColors(resolvedTheme: string | undefined): DitherColors {
  return resolvedTheme === "light"
    ? { colorBack: "#F5F4F0", colorFront: "#2E3FE6" }
    : { colorBack: "#0E0E10", colorFront: "#4F5FF5" };
}

/** Speed 0 stops the shader's rAF entirely; used under reduced motion and while the tab is hidden. */
export function ditherSpeed({ reducedMotion, hidden }: { reducedMotion: boolean; hidden: boolean }): number {
  return reducedMotion || hidden ? 0 : DITHER_SPEED;
}

/** The theme the toggle switches to; before hydration the page paints dark, so the toggle offers light. */
export function nextTheme(resolvedTheme: string | undefined): "light" | "dark" {
  return resolvedTheme === "light" ? "dark" : "light";
}

/** Paper Shaders needs WebGL2 and throws without it, so the panel checks first and paints the solid ground instead. */
export function supportsWebGL2(doc: Document): boolean {
  try {
    return !!doc.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
