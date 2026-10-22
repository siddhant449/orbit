/** The new screen's fade after a client navigation (opacity only). Keep in step with `.route-view` in globals.css. */
export const ROUTE_FADE_MS = 180;
/** A route skeleton stays invisible this long, so a fast load never flashes one. Keep in step with `.route-loading`. */
export const SKELETON_DELAY_MS = 120;

export type Fade = { keyframes: { opacity: number }[]; options: KeyframeAnimationOptions & { duration: number } };

/**
 * The fade for content replacing a route skeleton that was on screen for `visibleForMs` (counted from mount, so the
 * skeleton's own invisible delay is included). Null when the skeleton never showed, or under reduced motion.
 */
export function handoffFade(visibleForMs: number, reducedMotion: boolean): Fade | null {
  if (reducedMotion || visibleForMs < SKELETON_DELAY_MS) return null;
  return {
    keyframes: [{ opacity: 0.35 }, { opacity: 1 }],
    options: { duration: ROUTE_FADE_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  };
}

export type SkeletonKind = "home" | "chat" | "editor" | "posts" | "dashboard" | "grid" | "form" | "page";

const DASHBOARDS = new Set(["/analytics", "/engage", "/activities", "/challenge"]);

/** Which loading skeleton a screen gets: the one shaped like it, so the content lands without a jump. */
export function skeletonFor(pathname: string): SkeletonKind {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/chat/")) return "chat";
  if (pathname === "/posts") return "posts";
  if (pathname.startsWith("/posts/") && !pathname.startsWith("/posts/carousel")) return "editor";
  if (DASHBOARDS.has(pathname)) return "dashboard";
  if (pathname === "/ideas") return "grid";
  if (pathname === "/settings") return "form";
  return "page";
}
