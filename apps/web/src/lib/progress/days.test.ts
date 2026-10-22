import { describe, expect, it } from "vitest";
import { addDays, countByDay, dayKeyIn, dayLabel, isWeekend, mondayOf, resetsIn, weekdayOf } from "./days";

describe("day keys", () => {
  it("formats a date as the calendar day in the profile's timezone", () => {
    const d = new Date("2026-10-22T02:30:00Z");
    expect(dayKeyIn(d, "UTC")).toBe("2026-10-22");
    expect(dayKeyIn(d, "America/Los_Angeles")).toBe("2026-10-21");
    expect(dayKeyIn(d, "Asia/Kolkata")).toBe("2026-10-22");
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(dayKeyIn(new Date("2026-10-22T23:30:00Z"), "Not/AZone")).toBe("2026-10-22");
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-22", 29)).toBe("2026-11-20");
  });

  it("knows weekdays, weekends and the Monday of a week", () => {
    expect(weekdayOf("2026-10-22")).toBe(4); // Thursday
    expect(isWeekend("2026-10-24")).toBe(true);
    expect(isWeekend("2026-10-25")).toBe(true);
    expect(isWeekend("2026-10-26")).toBe(false);
    expect(mondayOf("2026-10-22")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
  });

  it("counts dates per local day", () => {
    const dates = [new Date("2026-10-21T23:00:00Z"), new Date("2026-10-22T01:00:00Z"), new Date("2026-10-22T10:00:00Z")];
    expect(countByDay(dates, "UTC")).toEqual({ "2026-10-21": 1, "2026-10-22": 2 });
    expect(countByDay(dates, "Asia/Kolkata")).toEqual({ "2026-10-22": 3 });
  });

  it("labels a day", () => {
    expect(dayLabel("2026-10-22")).toBe("Thu 22 Oct");
    expect(dayLabel("2026-11-18", { weekday: false })).toBe("18 Nov");
  });

  it("says how long until the local day resets", () => {
    expect(resetsIn(new Date("2026-10-22T17:00:00Z"), "UTC")).toBe("resets in 7h");
    expect(resetsIn(new Date("2026-10-22T23:35:00Z"), "UTC")).toBe("resets in 25m");
    expect(resetsIn(new Date("2026-10-22T17:00:00Z"), "Asia/Kolkata")).toBe("resets in 1h");
  });
});
