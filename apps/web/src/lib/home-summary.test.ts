import { describe, expect, it } from "vitest";
import { latestChatOf, summarizeStrategy } from "./home-summary";

const series = (name: string, weekday: string) => ({ name, weekday, description: "" });

describe("summarizeStrategy", () => {
  it("returns null without a strategy", () => {
    expect(summarizeStrategy(null, new Date("2026-10-22T10:00:00Z"), "UTC")).toBeNull();
  });

  it("lists the next three recurring series from today, in weekday order", () => {
    // 2026-10-22 is a Thursday.
    const row = {
      recurringSeries: [series("Monday notes", "mon"), series("Friday wins", "fri"), series("Thursday take", "thu"), series("Tuesday tip", "tue")],
      contentFormats: [],
    };
    expect(summarizeStrategy(row, new Date("2026-10-22T10:00:00Z"), "UTC")).toEqual({
      slots: [
        { day: "Thu", title: "Thursday take" },
        { day: "Fri", title: "Friday wins" },
        { day: "Mon", title: "Monday notes" },
      ],
    });
  });

  it("uses the profile's timezone to decide what today is", () => {
    const row = { recurringSeries: [series("Thursday take", "thu"), series("Friday wins", "fri")], contentFormats: [] };
    // 23:30 UTC Thursday is already Friday in Tokyo.
    expect(summarizeStrategy(row, new Date("2026-10-22T23:30:00Z"), "Asia/Tokyo")?.slots[0]).toEqual({ day: "Fri", title: "Friday wins" });
  });

  it("falls back to the weekly formats when there are no series", () => {
    const row = { recurringSeries: [], contentFormats: [{ format: "carousel", perWeek: 2, note: "" }, { format: "text", perWeek: 3, note: "" }] };
    expect(summarizeStrategy(row, new Date(), "UTC")).toEqual({
      slots: [
        { day: "3 a week", title: "Text" },
        { day: "2 a week", title: "Carousel" },
      ],
    });
  });

  it("ignores malformed JSON and yields no slots", () => {
    expect(summarizeStrategy({ recurringSeries: "x", contentFormats: null }, new Date(), "UTC")).toEqual({ slots: [] });
  });
});

describe("latestChatOf", () => {
  it("picks the most recently active chat even when pinned chats come first", () => {
    const chats = [
      { id: "p", title: "Pinned", pinned: true, lastActivityAt: new Date("2026-10-01T00:00:00Z") },
      { id: "b", title: "Newest", pinned: false, lastActivityAt: new Date("2026-10-21T00:00:00Z") },
      { id: "c", title: "Older", pinned: false, lastActivityAt: new Date("2026-10-20T00:00:00Z") },
    ];
    expect(latestChatOf(chats)).toEqual({ id: "b", title: "Newest", lastActivityAt: "2026-10-21T00:00:00.000Z" });
    expect(latestChatOf([])).toBeNull();
  });
});
