import { describe, expect, it } from "vitest";
import { BADGES, badgeProgress, earnedBadges } from "./badges";
import { GOAL_PRESETS, DEFAULT_PRESET, goalProblem, goalWeeks, isLastDayOfWeek, weekStreak } from "./goals";

const w = (posted: number, goal = 3) => ({ posted, goal });

describe("goals", () => {
  it("presets match the spec numbers", () => {
    expect(GOAL_PRESETS).toEqual({
      momentum: { posts: 3, comments: 25, dms: 5, connections: 10 },
      growth: { posts: 5, comments: 50, dms: 10, connections: 50 },
      creator: { posts: 7, comments: 70, dms: 15, connections: 35 },
    });
    expect(DEFAULT_PRESET).toBe("growth");
  });

  it("weekStreak counts consecutive met weeks back from last week, plus this week if met", () => {
    expect(weekStreak([])).toBe(0);
    expect(weekStreak([w(3), w(3), w(0)])).toBe(2); // this week not met yet: last two count
    expect(weekStreak([w(3), w(3), w(4)])).toBe(3); // this week met: plus one
    expect(weekStreak([w(3), w(1), w(3), w(3)])).toBe(2); // an unmet week breaks the run
    expect(weekStreak([w(0), w(0), w(3)])).toBe(1);
    expect(weekStreak([w(2), w(2)])).toBe(0);
    expect(weekStreak([{ posted: 5, goal: 0 }])).toBe(0);
  });

  it("buckets posts into Monday-first weeks ending today", () => {
    // 2026-11-04 is a Wednesday: this week is 2 Nov .. 8 Nov, and only days up to today count.
    const weeks = goalWeeks({ "2026-11-02": 1, "2026-11-04": 1, "2026-11-05": 9, "2026-10-30": 2, "2026-10-26": 1 }, "2026-11-04", 3, 3);
    expect(weeks).toEqual([w(0), w(3), w(2)].map((x, i) => (i === 0 ? { posted: 0, goal: 3 } : x)));
    expect(isLastDayOfWeek("2026-11-08")).toBe(true);
    expect(isLastDayOfWeek("2026-11-07")).toBe(false);
  });

  it("checks custom goal numbers", () => {
    expect(goalProblem({ posts: 4, comments: 0, dms: 0, connections: 0 })).toBeNull();
    expect(goalProblem({ posts: 0, comments: 1, dms: 1, connections: 1 })).toMatch(/Posts/);
    expect(goalProblem({ posts: 3, comments: 1.5, dms: 1, connections: 1 })).toMatch(/Comments/);
    expect(goalProblem({ posts: 3, comments: 1, dms: 999, connections: 1 })).toMatch(/DMs/);
  });
});

describe("badges", () => {
  const none = { posted: 0, fullWeek: false, weekStreak: 0, challengeFinished: false, ownTemplates: 0, spaces: 0, ideasDrafted: 0 };

  it("has the ten spec badges", () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      "first-post", "posts-5", "posts-10", "posts-25", "first-full-week", "streak-4", "challenge-finished", "first-template", "first-space", "ideas-drafted-10",
    ]);
  });

  it("earns each badge from its signal", () => {
    expect(earnedBadges(none)).toEqual([]);
    expect(earnedBadges({ ...none, posted: 5 })).toEqual(["first-post", "posts-5"]);
    expect(earnedBadges({ ...none, weekStreak: 4, fullWeek: true, challengeFinished: true, ownTemplates: 1, spaces: 2, ideasDrafted: 10 })).toEqual([
      "first-full-week", "streak-4", "challenge-finished", "first-template", "first-space", "ideas-drafted-10",
    ]);
  });

  it("progress caps at the target, and a stored badge stays earned", () => {
    const p = badgeProgress({ ...none, posted: 7 }, new Set(["first-space"]));
    expect(p.find((b) => b.id === "posts-10")).toMatchObject({ current: 7, target: 10, earned: false });
    expect(p.find((b) => b.id === "posts-5")).toMatchObject({ current: 5, earned: true });
    expect(p.find((b) => b.id === "first-space")).toMatchObject({ current: 1, earned: true });
  });
});
