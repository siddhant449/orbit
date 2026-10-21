import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

describe("greetingFor", () => {
  it("splits the day at noon and 18:00 in the profile's timezone", () => {
    // 11:59 and 12:00 in UTC
    expect(greetingFor(new Date("2026-10-22T11:59:00Z"), "UTC")).toBe("Good morning.");
    expect(greetingFor(new Date("2026-10-22T12:00:00Z"), "UTC")).toBe("Good afternoon.");
    expect(greetingFor(new Date("2026-10-22T17:59:00Z"), "UTC")).toBe("Good afternoon.");
    expect(greetingFor(new Date("2026-10-22T18:00:00Z"), "UTC")).toBe("Good evening.");
    expect(greetingFor(new Date("2026-10-22T00:00:00Z"), "UTC")).toBe("Good morning.");
    expect(greetingFor(new Date("2026-10-22T23:59:00Z"), "UTC")).toBe("Good evening.");
  });

  it("reads the hour in the given timezone, not the server's", () => {
    const instant = new Date("2026-10-22T10:30:00Z");
    expect(greetingFor(instant, "UTC")).toBe("Good morning.");
    expect(greetingFor(instant, "Asia/Kolkata")).toBe("Good afternoon."); // 16:00
    expect(greetingFor(instant, "Asia/Tokyo")).toBe("Good evening."); // 19:30
    expect(greetingFor(instant, "America/Los_Angeles")).toBe("Good morning."); // 03:30
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(greetingFor(new Date("2026-10-22T19:00:00Z"), "Not/AZone")).toBe("Good evening.");
  });
});
