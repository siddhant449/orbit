import { describe, expect, it } from "vitest";
import { dueForGeneration, weekStartOn } from "./week";

describe("weekStartOn", () => {
  it("handles UTC-8 and UTC+13 around midnight", () => {
    // Sun 2026-11-08 23:30 UTC-8 is Mon 2026-11-09 07:30 UTC; in UTC+13 it is already Mon 2026-11-09 12:30.
    const sundayLateLA = new Date("2026-11-09T07:30:00Z");
    expect(weekStartOn(sundayLateLA, "America/Los_Angeles")).toBe("2026-11-02");
    expect(weekStartOn(sundayLateLA, "Pacific/Auckland")).toBe("2026-11-09");
    // One minute after local midnight in Los Angeles (UTC-8 in November): a new week there.
    expect(weekStartOn(new Date("2026-11-09T08:01:00Z"), "America/Los_Angeles")).toBe("2026-11-09");
    // Mon 00:30 in Auckland (UTC+13) is still Sunday 11:30 UTC.
    const aucklandMidnight = new Date("2026-11-08T11:30:00Z");
    expect(weekStartOn(aucklandMidnight, "Pacific/Auckland")).toBe("2026-11-09");
    expect(weekStartOn(aucklandMidnight, "UTC")).toBe("2026-11-02");
    expect(weekStartOn(aucklandMidnight, "Not/AZone")).toBe("2026-11-02");
  });
});

describe("dueForGeneration", () => {
  it("is true on and after the generation day", () => {
    const wed = new Date("2026-11-04T12:00:00Z");
    expect(dueForGeneration(wed, "UTC", 1)).toBe(true);
    expect(dueForGeneration(wed, "UTC", 3)).toBe(true);
    expect(dueForGeneration(wed, "UTC", 4)).toBe(false);
    expect(dueForGeneration(new Date("2026-11-02T00:00:00Z"), "UTC", 1)).toBe(true);
    expect(dueForGeneration(new Date("2026-11-01T23:59:00Z"), "UTC", 7)).toBe(true);
  });

  it("uses the profile's local weekday", () => {
    // 2026-11-08 20:00 UTC is Sunday in LA but Monday 09:00 in Auckland (UTC+13).
    const t = new Date("2026-11-08T20:00:00Z");
    expect(dueForGeneration(t, "America/Los_Angeles", 7)).toBe(true);
    expect(dueForGeneration(t, "America/Los_Angeles", 1)).toBe(true);
    expect(dueForGeneration(t, "Pacific/Auckland", 2)).toBe(false);
    expect(dueForGeneration(t, "Pacific/Auckland", 1)).toBe(true);
  });
});
