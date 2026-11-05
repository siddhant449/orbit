import { describe, expect, it } from "vitest";
import { buildDerivedRows, relativeTime } from "./whats-new";

describe("buildDerivedRows", () => {
  it("derived rows: challenge first, then ideas waiting, then next step; none when empty", () => {
    expect(buildDerivedRows({ challenge: null, ideasWaiting: 0, nextStep: null })).toEqual([]);
    const rows = buildDerivedRows({
      challenge: { day: 3, posted: 2, total: 22, href: "/challenge" },
      ideasWaiting: 5,
      nextStep: { title: "Add something to your knowledge base", href: "/knowledge-base" },
    });
    expect(rows.map((r) => r.id)).toEqual(["challenge", "ideas", "next-step"]);
    expect(rows[0]).toMatchObject({ title: "Challenge day 3", detail: "2 of 22 posted", href: "/challenge" });
    expect(rows[1]).toMatchObject({ title: "5 ideas are waiting for you", href: "/ideas" });
    expect(buildDerivedRows({ challenge: null, ideasWaiting: 1, nextStep: null })[0]!.title).toBe("1 idea is waiting for you");
    expect(buildDerivedRows({ challenge: null, ideasWaiting: 0, nextStep: { title: "x", href: "/x" } }).map((r) => r.id)).toEqual(["next-step"]);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("reads naturally", () => {
    expect(relativeTime("2026-11-05T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-11-05T11:55:00Z", now)).toBe("5 min ago");
    expect(relativeTime("2026-11-05T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("2026-11-03T12:00:00Z", now)).toBe("2 d ago");
    expect(relativeTime("2026-10-01T12:00:00Z", now)).toBe("Oct 1");
  });
});
