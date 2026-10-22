import { describe, expect, it } from "vitest";
import {
  bestWeekdayStreak,
  draftsThisWeek,
  gettingStarted,
  hadFullWeek,
  milestones,
  nextMilestone,
  weekStrip,
  weekdayStreak,
} from "./activity";

// 2026-10-22 is a Thursday.
const THU = "2026-10-22";

describe("weekdayStreak", () => {
  it("counts weekdays in a row with a draft, ending today", () => {
    expect(weekdayStreak({ "2026-10-20": 1, "2026-10-21": 3, [THU]: 1 }, THU)).toBe(3);
  });
  it("doesn't break on a today without a draft yet", () => {
    expect(weekdayStreak({ "2026-10-20": 1, "2026-10-21": 1 }, THU)).toBe(2);
  });
  it("skips weekends: they neither break the streak nor add to it", () => {
    expect(weekdayStreak({ "2026-10-16": 1, "2026-10-19": 1 }, "2026-10-19")).toBe(2);
    expect(weekdayStreak({ "2026-10-16": 1, "2026-10-17": 1, "2026-10-19": 1 }, "2026-10-19")).toBe(2);
    expect(weekdayStreak({ "2026-10-16": 1, "2026-10-17": 1 }, "2026-10-18")).toBe(1);
  });
  it("can be limited to days on or after a start date", () => {
    expect(weekdayStreak({ "2026-10-20": 1, "2026-10-21": 1, [THU]: 1 }, THU, "2026-10-21")).toBe(2);
  });
  it("is zero after a missed weekday", () => {
    expect(weekdayStreak({ "2026-10-20": 1 }, THU)).toBe(0);
    expect(weekdayStreak({}, THU)).toBe(0);
  });
});

describe("bestWeekdayStreak", () => {
  it("finds the longest run with the same rules", () => {
    const drafts = { "2026-10-01": 1, "2026-10-02": 1, "2026-10-04": 1, "2026-10-05": 1, "2026-10-06": 1, "2026-10-08": 1 };
    expect(bestWeekdayStreak(drafts, THU)).toBe(4);
    expect(bestWeekdayStreak({}, THU)).toBe(0);
  });
});

describe("weeks", () => {
  it("counts this week's drafts from Monday", () => {
    expect(draftsThisWeek({ "2026-10-18": 4, "2026-10-19": 1, [THU]: 2, "2026-10-23": 9 }, THU)).toBe(3);
  });

  it("knows whether any Monday-to-Sunday week had drafts on five days", () => {
    expect(hadFullWeek({ "2026-10-12": 1, "2026-10-13": 1, "2026-10-14": 1, "2026-10-15": 1, "2026-10-18": 1 })).toBe(true);
    expect(hadFullWeek({ "2026-10-15": 1, "2026-10-16": 1, "2026-10-17": 1, "2026-10-18": 1, "2026-10-19": 1 })).toBe(false);
  });

  it("builds a Monday-first strip with past, today and future days", () => {
    const strip = weekStrip({ "2026-10-19": 2, [THU]: 1 }, THU, 0);
    expect(strip.map((d) => d.key)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(strip[0]).toMatchObject({ weekday: "Mon", date: 19, drafts: 2, when: "past" });
    expect(strip[3]).toMatchObject({ when: "today", drafts: 1 });
    expect(strip[4]).toMatchObject({ when: "future", drafts: 0 });
    expect(weekStrip({}, THU, -1)[0]!.key).toBe("2026-10-12");
  });
});

describe("milestones", () => {
  it("earns badges from real draft history and names the next one", () => {
    const none = milestones({ total: 0, best: 0, fullWeek: false });
    expect(none.map((m) => m.id)).toEqual(["first-draft", "streak-3", "full-week", "ten-drafts"]);
    expect(none.every((m) => !m.earned)).toBe(true);
    expect(nextMilestone(none)).toMatchObject({ id: "first-draft", toGo: 1 });

    const some = milestones({ total: 4, best: 2, fullWeek: false });
    expect(some.find((m) => m.id === "first-draft")!.earned).toBe(true);
    expect(nextMilestone(some)).toMatchObject({ id: "streak-3", toGo: 1 });

    const all = milestones({ total: 12, best: 5, fullWeek: true });
    expect(nextMilestone(all)).toBeNull();
  });
});

describe("gettingStarted", () => {
  it("maps real onboarding signals to checklist rows", () => {
    const list = gettingStarted({ strategy: true, identity: false, knowledge: true, voice: false, drafts: 0 });
    expect(list.items.map((i) => [i.id, i.done])).toEqual([
      ["strategy", true],
      ["about-you", false],
      ["knowledge", true],
      ["voice", false],
      ["first-draft", false],
    ]);
    expect(list.done).toBe(2);
    expect(list.items.every((i) => i.href.startsWith("/"))).toBe(true);
  });
});
