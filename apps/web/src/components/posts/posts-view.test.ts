import { describe, expect, it } from "vitest";
import {
  addDays,
  boardColumns,
  excerpt,
  filterPosts,
  gmtLabel,
  hourLabel,
  monthLabel,
  moveSlot,
  agendaPlanHour,
  clipText,
  safeTimeZone,
  parseView,
  parseWeek,
  placeByLastEdit,
  planHref,
  planPrompt,
  relativeTime,
  slotIsPlannable,
  todayIn,
  weekDays,
  weekStartOf,
  zonedParts,
  type PostRow,
} from "./posts-view";

const post = (over: Partial<PostRow> = {}): PostRow => ({
  id: "p1",
  title: "Why we killed the free tier",
  status: "DRAFT",
  version: 1,
  text: "Free users cost us more than they taught us.\n\nMore.",
  chatId: "c1",
  updatedAt: "2026-10-21T04:00:00.000Z",
  ...over,
});

describe("parseView", () => {
  it("accepts board, list and calendar and falls back to board", () => {
    expect(parseView("list")).toBe("list");
    expect(parseView("calendar")).toBe("calendar");
    expect(parseView("board")).toBe("board");
    expect(parseView(undefined)).toBe("board");
    expect(parseView("kanban")).toBe("board");
    expect(parseView(["calendar", "list"])).toBe("calendar");
  });
});

describe("excerpt", () => {
  it("takes the first line that isn't the title, collapsed and cut at a word", () => {
    expect(excerpt("Why we killed it\n\nFree users  cost us\tmore.", "Why we killed it")).toBe("Free users cost us more.");
    expect(excerpt("   \n\nOnly line", "Title")).toBe("Only line");
    const long = "word ".repeat(60).trim();
    const cut = excerpt(long, "t", 40);
    expect(cut.length).toBeLessThanOrEqual(41);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/\s…$/);
    expect(excerpt("", "t")).toBe("");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("speaks in the board's short register", () => {
    expect(relativeTime("2026-10-21T11:59:40Z", now)).toBe("Just now");
    expect(relativeTime("2026-10-21T11:55:00Z", now)).toBe("5m ago");
    expect(relativeTime("2026-10-21T11:00:00Z", now)).toBe("1h ago");
    expect(relativeTime("2026-10-18T12:00:00Z", now)).toBe("3d ago");
    expect(relativeTime("2026-09-15T12:00:00Z", now)).toBe("1 mo ago");
    expect(relativeTime("2025-09-15T12:00:00Z", now)).toBe("1 yr ago");
    expect(relativeTime("2026-10-21T12:05:00Z", now)).toBe("Just now");
  });
});

describe("filterPosts", () => {
  const rows = [post({ id: "a", title: "Pricing pages", text: "Every hidden fee is a lie" }), post({ id: "b", title: "Hiring", text: "We listed problems" })];
  it("matches every word against the title and text, ignoring case", () => {
    expect(filterPosts(rows, "").map((p) => p.id)).toEqual(["a", "b"]);
    expect(filterPosts(rows, "  HIDDEN  pricing ").map((p) => p.id)).toEqual(["a"]);
    expect(filterPosts(rows, "problems").map((p) => p.id)).toEqual(["b"]);
    expect(filterPosts(rows, "pricing problems")).toEqual([]);
  });
});

describe("boardColumns", () => {
  it("maps columns to what exists: drafts are real, ideas, scheduled and published are empty", () => {
    const cols = boardColumns([post({ id: "a" }), post({ id: "b" })]);
    expect(cols.map((c) => c.id)).toEqual(["all", "ideas", "draft", "scheduled", "published"]);
    expect(cols.map((c) => c.posts.length)).toEqual([2, 0, 2, 0, 0]);
    expect(cols.map((c) => c.label)).toEqual(["All posts", "Ideas", "Draft", "Scheduled", "Published"]);
  });
});

describe("zoned dates", () => {
  it("reads wall-clock parts in the profile's timezone", () => {
    expect(zonedParts(new Date("2026-10-21T20:00:00Z"), "Asia/Kolkata")).toEqual({ date: "2026-10-22", hour: 1, minute: 30 });
    expect(zonedParts(new Date("2026-10-21T20:00:00Z"), "UTC")).toEqual({ date: "2026-10-21", hour: 20, minute: 0 });
    expect(todayIn(new Date("2026-10-21T20:00:00Z"), "America/New_York")).toBe("2026-10-21");
  });

  it("does civil-date arithmetic across months and years", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(weekStartOf("2026-10-21")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
  });

  it("lists a Monday-first week", () => {
    const days = weekDays("2026-10-19");
    expect(days.map((d) => `${d.weekday} ${d.day}`)).toEqual(["Mon 19", "Tue 20", "Wed 21", "Thu 22", "Fri 23", "Sat 24", "Sun 25"]);
    expect(days[0]!.iso).toBe("2026-10-19");
  });

  it("parses ?week= to its Monday, or today's week when missing or malformed", () => {
    expect(parseWeek("2026-10-22", "2026-01-07")).toBe("2026-10-19");
    expect(parseWeek(undefined, "2026-10-21")).toBe("2026-10-19");
    expect(parseWeek("garbage", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeek("2026-13-40", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeek("9999-12-31", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeek("0001-01-01", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeek("2099-12-31", "2026-10-21")).toBe("2099-12-28");
  });

  it("labels the month, spanning two when the week does", () => {
    expect(monthLabel(weekDays("2026-10-19"))).toEqual({ month: "October", year: "2026" });
    expect(monthLabel(weekDays("2026-10-26"))).toEqual({ month: "October – November", year: "2026" });
    expect(monthLabel(weekDays("2026-12-28"))).toEqual({ month: "December 2026 – January", year: "2027" });
  });

  it("names the offset and the zone", () => {
    expect(gmtLabel("Asia/Kolkata", new Date("2026-10-21T00:00:00Z"))).toBe("GMT+5:30 · Asia/Kolkata");
    expect(gmtLabel("UTC", new Date("2026-10-21T00:00:00Z"))).toBe("GMT · UTC");
  });

  it("formats hour rows like the artboard", () => {
    expect(hourLabel(0)).toBe("0:00");
    expect(hourLabel(9)).toBe("9:00");
    expect(hourLabel(16)).toBe("16:00");
  });
});

describe("placeByLastEdit", () => {
  it("puts each post in its last-edited day and hour, in the profile's timezone, for this week only", () => {
    const rows = [
      post({ id: "a", updatedAt: "2026-10-21T04:00:00Z" }), // Wed 21, 9:30 in Kolkata
      post({ id: "b", updatedAt: "2026-10-21T04:20:00Z" }), // Wed 21, 9:50
      post({ id: "c", updatedAt: "2026-10-26T04:00:00Z" }), // next week
    ];
    const placed = placeByLastEdit(rows, weekDays("2026-10-19"), "Asia/Kolkata");
    expect([...placed.keys()]).toEqual(["2026-10-21|9"]);
    expect(placed.get("2026-10-21|9")!.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("planning", () => {
  const now = new Date("2026-10-21T04:00:00Z"); // Wed 21, 9:30 Kolkata
  it("only offers slots that haven't ended", () => {
    expect(slotIsPlannable("2026-10-21", 9, now, "Asia/Kolkata")).toBe(true);
    expect(slotIsPlannable("2026-10-21", 8, now, "Asia/Kolkata")).toBe(false);
    expect(slotIsPlannable("2026-10-20", 22, now, "Asia/Kolkata")).toBe(false);
    expect(slotIsPlannable("2026-10-22", 0, now, "Asia/Kolkata")).toBe(true);
  });

  it("writes the date, time and zone into the draft prompt", () => {
    expect(planPrompt("2026-10-22", 9, "Asia/Kolkata")).toBe(
      "Help me draft a LinkedIn post I plan to publish on Thursday, 22 October 2026 at 9:00 (Asia/Kolkata). It's about ",
    );
    expect(planHref("2026-10-22", 9, "UTC")).toBe(`/?prompt=${encodeURIComponent(planPrompt("2026-10-22", 9, "UTC"))}`);
  });
});

describe("moveSlot", () => {
  it("moves through days and hours with the arrow keys, clamping at the edges", () => {
    expect(moveSlot({ day: 2, hour: 9 }, "ArrowRight")).toEqual({ day: 3, hour: 9 });
    expect(moveSlot({ day: 6, hour: 9 }, "ArrowRight")).toEqual({ day: 6, hour: 9 });
    expect(moveSlot({ day: 0, hour: 9 }, "ArrowLeft")).toEqual({ day: 0, hour: 9 });
    expect(moveSlot({ day: 2, hour: 9 }, "ArrowDown")).toEqual({ day: 2, hour: 10 });
    expect(moveSlot({ day: 2, hour: 23 }, "ArrowDown")).toEqual({ day: 2, hour: 23 });
    expect(moveSlot({ day: 2, hour: 0 }, "ArrowUp")).toEqual({ day: 2, hour: 0 });
    expect(moveSlot({ day: 2, hour: 9 }, "Home")).toEqual({ day: 0, hour: 9 });
    expect(moveSlot({ day: 2, hour: 9 }, "End")).toEqual({ day: 6, hour: 9 });
    expect(moveSlot({ day: 2, hour: 9 }, "PageDown")).toEqual({ day: 2, hour: 15 });
    expect(moveSlot({ day: 2, hour: 20 }, "PageDown")).toEqual({ day: 2, hour: 23 });
    expect(moveSlot({ day: 2, hour: 3 }, "PageUp")).toEqual({ day: 2, hour: 0 });
    expect(moveSlot({ day: 2, hour: 9 }, "a")).toBeNull();
  });
});

describe("agendaPlanHour", () => {
  const now = new Date("2026-10-21T04:00:00Z"); // Wed 21, 9:30 Kolkata
  it("offers 9:00 on future days, the next hour today, and nothing in the past", () => {
    expect(agendaPlanHour("2026-10-22", now, "Asia/Kolkata")).toBe(9);
    expect(agendaPlanHour("2026-10-21", now, "Asia/Kolkata")).toBe(10);
    expect(agendaPlanHour("2026-10-20", now, "Asia/Kolkata")).toBeNull();
    expect(agendaPlanHour("2026-10-21", new Date("2026-10-21T17:00:00Z"), "Asia/Kolkata")).toBe(23);
    expect(agendaPlanHour("2026-10-21", new Date("2026-10-21T18:31:00Z"), "Asia/Kolkata")).toBeNull();
  });
});

describe("clipText", () => {
  it("caps the text sent to the client by code points, without splitting a surrogate pair", () => {
    expect(clipText("short")).toBe("short");
    const long = "a".repeat(2499) + "😀😀";
    const clipped = clipText(long);
    expect(Array.from(clipped)).toHaveLength(2500);
    expect(clipped.endsWith("😀")).toBe(true);
    expect(clipped).not.toMatch(/\uD83D$/);
  });
});

describe("safeTimeZone", () => {
  it("keeps a real IANA zone and falls back to UTC otherwise", () => {
    expect(safeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
    expect(safeTimeZone("")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
  });
});
