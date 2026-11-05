import { describe, expect, it } from "vitest";
import { dayKeyIn } from "@/lib/progress/days";
import { dayStatus, reminderDate, sidebarState, summarizeChallenge, type ChallengeView } from "./status";

const day = (date: string, formatId: string | null = "f") => ({ date, formatId });
const posted = { postedAt: new Date("2026-11-10T09:00:00Z") };
const draft = { postedAt: null };

describe("dayStatus", () => {
  it("covers rest, upcoming, today, in_progress, posted, missed", () => {
    const today = "2026-11-04";
    expect(dayStatus(day("2026-11-07", null), today, null)).toBe("rest");
    expect(dayStatus(day("2026-11-05"), today, null)).toBe("upcoming");
    expect(dayStatus(day("2026-11-04"), today, null)).toBe("today");
    expect(dayStatus(day("2026-11-04"), today, draft)).toBe("in_progress");
    expect(dayStatus(day("2026-11-05"), today, draft)).toBe("upcoming");
    expect(dayStatus(day("2026-11-04"), today, posted)).toBe("posted");
    expect(dayStatus(day("2026-11-03"), today, null)).toBe("missed");
    expect(dayStatus(day("2026-11-03"), today, draft)).toBe("in_progress");
    expect(dayStatus(day("2026-11-07", null), today, posted)).toBe("rest");
  });

  it("a missed day posted later counts as posted", () => {
    expect(dayStatus(day("2026-11-03"), "2026-11-10", null)).toBe("missed");
    expect(dayStatus(day("2026-11-03"), "2026-11-10", { postedAt: "2026-11-10T08:00:00.000Z" })).toBe("posted");
  });

  it("a deleted post on a challenge day shows the day as missed, not an error", () => {
    // The service hands back no post for a deleted one.
    expect(dayStatus(day("2026-11-03"), "2026-11-10", null)).toBe("missed");
    expect(dayStatus(day("2026-11-10"), "2026-11-10", null)).toBe("today");
  });

  it("the challenge's today follows the profile's zone around midnight (UTC-8 and UTC+13)", () => {
    const at = new Date("2026-11-04T07:30:00Z");
    const west = dayKeyIn(at, "Pacific/Pitcairn");
    const east = dayKeyIn(at, "Pacific/Auckland");
    expect(west).toBe("2026-11-03");
    expect(east).toBe("2026-11-04");
    // The same stored day is today in the east and still upcoming in the west.
    expect(dayStatus(day("2026-11-04"), east, null)).toBe("today");
    expect(dayStatus(day("2026-11-04"), west, null)).toBe("upcoming");
    expect(dayStatus(day("2026-11-03"), east, null)).toBe("missed");
  });
});

function view(today: string, over: Partial<ChallengeView> = {}): ChallengeView {
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.parse("2026-11-04T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { dayNumber: i + 1, date, formatId: wd === 0 || wd === 6 ? null : `f${i}`, chatId: null, doc: null };
  });
  return { id: "e", startDate: "2026-11-04", finishDate: "2026-12-03", today, completedAt: null, endedAt: null, days, ...over };
}

describe("summarizeChallenge", () => {
  it("counts posted and missed posting days and picks the focus", () => {
    const v = view("2026-11-09");
    v.days[0]!.doc = { id: "a", title: "A", postedAt: "2026-11-04T10:00:00Z" };
    v.days[1]!.doc = { id: "b", title: "B", postedAt: "2026-11-05T10:00:00Z" };
    const s = summarizeChallenge(v);
    expect(s.phase).toBe("active");
    expect(s.dayNumber).toBe(6);
    expect(s.postDays).toBe(22);
    expect(s.posted).toBe(2);
    expect(s.missed).toBe(1); // Friday 6 Nov; the weekend is rest
    expect(s.bestStreak).toBe(2);
    expect(s.focus?.date).toBe("2026-11-09");
    expect(sidebarState(v)).toEqual({ day: 6, posted: 2, total: 22 });
  });

  it("is finished after the 30th day or once completed, and upcoming before the start", () => {
    expect(summarizeChallenge(view("2026-12-04")).phase).toBe("finished");
    expect(summarizeChallenge(view("2026-11-20", { completedAt: "2026-11-20T00:00:00Z" })).focus).toBeNull();
    const up = summarizeChallenge(view("2026-11-01"));
    expect(up.phase).toBe("upcoming");
    expect(up.dayNumber).toBeNull();
    expect(sidebarState(view("2026-11-01"))).toBeNull();
    expect(sidebarState(null)).toBeNull();
  });

  it("an ended challenge reads as finished with its summary", () => {
    expect(summarizeChallenge(view("2026-11-09", { endedAt: "2026-11-09T10:00:00Z" })).phase).toBe("finished");
  });

  it("reminds three days before the last day", () => {
    expect(reminderDate("2026-12-03")).toBe("2026-11-30");
  });
});
