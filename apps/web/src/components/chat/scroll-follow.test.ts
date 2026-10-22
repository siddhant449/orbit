import { describe, expect, it } from "vitest";
import { FOLLOW_THRESHOLD, followReducer, initialFollow } from "./scroll-follow";

describe("followReducer", () => {
  it("starts following the newest message", () => {
    expect(initialFollow).toEqual({ following: true, unseen: false });
  });

  it("stops following once the reader scrolls up past the threshold, and resumes at the bottom", () => {
    const up = followReducer(initialFollow, { type: "scroll", distance: FOLLOW_THRESHOLD + 1 });
    expect(up.following).toBe(false);
    const near = followReducer(up, { type: "scroll", distance: FOLLOW_THRESHOLD - 1 });
    expect(near).toEqual({ following: true, unseen: false });
  });

  it("marks new content as unseen only while not following", () => {
    expect(followReducer(initialFollow, { type: "content" })).toEqual(initialFollow);
    const up = followReducer(initialFollow, { type: "scroll", distance: 900 });
    expect(followReducer(up, { type: "content" })).toEqual({ following: false, unseen: true });
  });

  it("a send or a jump always goes back to following", () => {
    const away = { following: false, unseen: true };
    expect(followReducer(away, { type: "send" })).toEqual(initialFollow);
    expect(followReducer(away, { type: "jump" })).toEqual(initialFollow);
  });

  it("returns the same state object when nothing changes", () => {
    expect(followReducer(initialFollow, { type: "scroll", distance: 0 })).toBe(initialFollow);
  });
});
