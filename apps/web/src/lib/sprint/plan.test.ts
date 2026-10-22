import { describe, expect, it } from "vitest";
import { SPRINT_FORMATS } from "./curriculum";
import { buildSprint, parseStart } from "./plan";

// 2026-10-20 is a Tuesday, like the artboard's day 1.
const TUE = "2026-10-20";

describe("buildSprint", () => {
  it("lays out 30 calendar days with weekends as rest and formats in weekday order", () => {
    const s = buildSprint({ start: TUE, today: TUE, drafts: {} });
    expect(s.days).toHaveLength(30);
    expect(s.days[0]).toMatchObject({ day: 1, key: TUE, kind: "post", format: SPRINT_FORMATS[0] });
    expect(s.days[3]).toMatchObject({ day: 4, kind: "post", format: SPRINT_FORMATS[3] }); // Fri
    expect(s.days[4]).toMatchObject({ day: 5, kind: "rest", status: "rest" }); // Sat
    expect(s.days[5]).toMatchObject({ day: 6, kind: "rest" }); // Sun
    expect(s.days[6]).toMatchObject({ day: 7, kind: "post", format: SPRINT_FORMATS[4] }); // Mon
    expect(s.postDays).toBe(22);
    expect(s.days.at(-1)).toMatchObject({ day: 30, key: "2026-11-18" });
    expect(s.finish).toBe("2026-11-18");
    expect(s.leadingBlanks).toBe(1); // Tuesday sits in the second Mon-first column
  });

  it("has 20 post days when the sprint starts on a Saturday", () => {
    const s = buildSprint({ start: "2026-10-24", today: "2026-10-24", drafts: {} });
    expect(s.postDays).toBe(20);
    expect(s.leadingBlanks).toBe(5);
  });

  it("derives drafted, missed, today and upcoming from drafts per day", () => {
    const today = "2026-10-27"; // day 8, a Tuesday
    const s = buildSprint({ start: TUE, today, drafts: { "2026-10-20": 1, "2026-10-22": 2, "2026-10-25": 1 } });
    const status = (day: number) => s.days[day - 1]!.status;
    expect(status(1)).toBe("drafted");
    expect(status(2)).toBe("missed");
    expect(status(3)).toBe("drafted");
    expect(status(4)).toBe("missed");
    expect(status(6)).toBe("rest"); // a weekend draft doesn't turn a rest day into a post day
    expect(status(7)).toBe("missed");
    expect(status(8)).toBe("today");
    expect(status(9)).toBe("upcoming");
    expect(s.dayNumber).toBe(8);
    expect(s.phase).toBe("active");
    expect(s.drafted).toBe(2);
    expect(s.missed).toBe(3);
    expect(s.today).toMatchObject({ day: 8, isToday: true });
    expect(s.focus).toMatchObject({ day: 8 });
  });

  it("marks today drafted once a draft exists today", () => {
    const s = buildSprint({ start: TUE, today: TUE, drafts: { [TUE]: 1 } });
    expect(s.days[0]).toMatchObject({ status: "drafted", isToday: true, drafts: 1 });
    expect(s.drafted).toBe(1);
  });

  it("counts the streak back over post days, skipping rest days and an undrafted today", () => {
    const drafts = { "2026-10-22": 1, "2026-10-23": 1, "2026-10-26": 1 };
    expect(buildSprint({ start: TUE, today: "2026-10-27", drafts }).streak).toBe(3);
    expect(buildSprint({ start: TUE, today: "2026-10-26", drafts }).streak).toBe(3);
    expect(buildSprint({ start: TUE, today: "2026-10-28", drafts }).streak).toBe(0);
  });

  it("focuses the next post day on a rest day", () => {
    const s = buildSprint({ start: TUE, today: "2026-10-24", drafts: {} });
    expect(s.today).toMatchObject({ day: 5, kind: "rest" });
    expect(s.focus).toMatchObject({ day: 7, format: SPRINT_FORMATS[4] });
  });

  it("reports a sprint that hasn't started or has finished", () => {
    const before = buildSprint({ start: TUE, today: "2026-10-19", drafts: {} });
    expect(before).toMatchObject({ phase: "upcoming", dayNumber: null, today: null });
    expect(before.focus).toMatchObject({ day: 1 });
    expect(before.days.every((d) => d.status === "upcoming" || d.status === "rest")).toBe(true);
    const after = buildSprint({ start: TUE, today: "2026-11-19", drafts: {} });
    expect(after).toMatchObject({ phase: "finished", dayNumber: null, today: null, focus: null, missed: 22 });
  });
});

describe("parseStart", () => {
  it("accepts a real YYYY-MM-DD within a year of today and rejects the rest", () => {
    expect(parseStart("2026-10-20", "2026-10-22")).toBe("2026-10-20");
    expect(parseStart("2026-02-30", "2026-10-22")).toBeNull();
    expect(parseStart("20-10-2026", "2026-10-22")).toBeNull();
    expect(parseStart("2024-10-20", "2026-10-22")).toBeNull();
    expect(parseStart("2028-10-20", "2026-10-22")).toBeNull();
    expect(parseStart(undefined, "2026-10-22")).toBeNull();
    expect(parseStart(["2026-10-20"], "2026-10-22")).toBeNull();
  });
});
