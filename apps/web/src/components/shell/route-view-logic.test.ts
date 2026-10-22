import { describe, expect, it } from "vitest";
import { handoffFade, ROUTE_FADE_MS, skeletonFor, SKELETON_DELAY_MS } from "./route-view-logic";

describe("handoffFade", () => {
  it("does nothing when the skeleton never became visible (a fast load shows no skeleton, so nothing to hand off)", () => {
    expect(handoffFade(SKELETON_DELAY_MS - 1, false)).toBeNull();
    expect(handoffFade(0, false)).toBeNull();
  });

  it("fades the content in, opacity only, once a skeleton was on screen", () => {
    const fade = handoffFade(SKELETON_DELAY_MS + 200, false)!;
    expect(fade.options.duration).toBe(ROUTE_FADE_MS);
    expect(fade.keyframes).toEqual([{ opacity: expect.any(Number) }, { opacity: 1 }]);
    expect(fade.keyframes[0]!.opacity).toBeGreaterThan(0);
    expect(fade.keyframes[0]!.opacity).toBeLessThan(1);
    expect(Object.keys(fade.keyframes[0]!)).toEqual(["opacity"]);
  });

  it("is off under reduced motion", () => {
    expect(handoffFade(SKELETON_DELAY_MS + 500, true)).toBeNull();
  });

  it("keeps the timings short enough to never feel like a page transition", () => {
    expect(ROUTE_FADE_MS).toBeLessThanOrEqual(200);
    expect(SKELETON_DELAY_MS).toBeGreaterThanOrEqual(100);
    expect(SKELETON_DELAY_MS).toBeLessThanOrEqual(150);
  });
});

describe("skeletonFor", () => {
  it.each([
    ["/", "home"],
    ["/chat/3f1c", "chat"],
    ["/posts", "posts"],
    ["/posts/abc", "editor"],
    ["/posts/carousel/new", "page"],
    ["/analytics", "dashboard"],
    ["/engage", "dashboard"],
    ["/activities", "dashboard"],
    ["/challenge", "dashboard"],
    ["/ideas", "grid"],
    ["/settings", "form"],
    ["/settings/memories", "page"],
    ["/strategy", "page"],
    ["/knowledge-base", "page"],
    ["/templates", "page"],
  ] as const)("%s opens with the %s skeleton", (path, kind) => {
    expect(skeletonFor(path)).toBe(kind);
  });
});
