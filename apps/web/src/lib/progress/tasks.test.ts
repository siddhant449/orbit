import { describe, expect, it } from "vitest";
import { carriedLabel, dayProgress, MAX_PAUSE_DAYS, pauseUntil, tasksForDate, validPause, type TaskLike } from "./tasks";

const t = (id: string, over: Partial<TaskLike> = {}): TaskLike => ({
  id, title: id, note: null, repeat: "once", weekday: null, position: 0, pausedUntil: null, createdOn: "2026-11-02", ...over,
});
const ids = (rows: { task: { id: string } }[]) => rows.map((r) => r.task.id);

describe("tasksForDate", () => {
  it("a missed one-off carries over; skip hides for today; pause over 28 days is rejected", () => {
    const once = t("once"); // made Monday 2 Nov
    expect(ids(tasksForDate([once], [], "2026-11-02", "2026-11-04"))).toEqual(["once"]);
    const today = tasksForDate([once], [], "2026-11-04", "2026-11-04");
    expect(today).toMatchObject([{ carriedOver: true, status: "open" }]);
    expect(tasksForDate([once], [], "2026-11-03", "2026-11-04")).toEqual([]);
    // Done on its day: it no longer carries.
    expect(tasksForDate([once], [{ taskId: "once", date: "2026-11-02", status: "DONE" }], "2026-11-04", "2026-11-04")).toEqual([]);
    // Done today after carrying: done today.
    expect(tasksForDate([once], [{ taskId: "once", date: "2026-11-04", status: "DONE" }], "2026-11-04", "2026-11-04")[0]!.status).toBe("done");

    // Skip: the row is marked skipped and days leave it out of their counts.
    const daily = t("daily", { repeat: "weekdays" });
    const skipped = tasksForDate([daily], [{ taskId: "daily", date: "2026-11-04", status: "SKIPPED" }], "2026-11-04", "2026-11-04");
    expect(skipped[0]!.status).toBe("skipped");
    expect(dayProgress(skipped)).toEqual({ done: 0, total: 0 });
    expect(tasksForDate([daily], [{ taskId: "daily", date: "2026-11-04", status: "SKIPPED" }], "2026-11-05", "2026-11-05")[0]!.status).toBe("open");

    expect(pauseUntil("2026-11-04", 28)).toBe("2026-12-02");
    expect(pauseUntil("2026-11-04", 29)).toBeNull();
    expect(pauseUntil("2026-11-04", 0)).toBeNull();
    expect(MAX_PAUSE_DAYS).toBe(28);
    expect(validPause("2026-11-04", "2026-12-02")).toBe(true);
    expect(validPause("2026-11-04", "2026-12-03")).toBe(false);
    expect(validPause("2026-11-04", "2026-11-04")).toBe(false);
  });

  it("weekday tasks repeat Monday to Friday from the day they were made; weekly ones on their day", () => {
    const daily = t("daily", { repeat: "weekdays", createdOn: "2026-11-04" }); // Wednesday
    expect(ids(tasksForDate([daily], [], "2026-11-03", "2026-11-05"))).toEqual([]);
    expect(ids(tasksForDate([daily], [], "2026-11-05", "2026-11-05"))).toEqual(["daily"]);
    expect(ids(tasksForDate([daily], [], "2026-11-07", "2026-11-07"))).toEqual([]);
    const weekly = t("weekly", { repeat: "weekly", weekday: 2 });
    expect(ids(tasksForDate([weekly], [], "2026-11-10", "2026-11-10"))).toEqual(["weekly"]);
    expect(ids(tasksForDate([weekly], [], "2026-11-11", "2026-11-11"))).toEqual([]);
    expect(tasksForDate([daily], [], "2026-11-05", "2026-11-05")[0]!.carriedOver).toBe(false);
  });

  it("a paused task is hidden through its pause, then returns; order follows position", () => {
    const paused = t("p", { repeat: "weekdays", pausedUntil: "2026-11-10" });
    expect(tasksForDate([paused], [], "2026-11-10", "2026-11-10")).toEqual([]);
    expect(ids(tasksForDate([paused], [], "2026-11-11", "2026-11-11"))).toEqual(["p"]);
    const a = t("a", { repeat: "weekdays", position: 2 });
    const b = t("b", { repeat: "weekdays", position: 1 });
    expect(ids(tasksForDate([a, b], [], "2026-11-04", "2026-11-04"))).toEqual(["b", "a"]);
  });

  it("counts done of total and labels carried tasks", () => {
    const a = t("a", { repeat: "weekdays" });
    const b = t("b", { repeat: "weekdays" });
    const rows = tasksForDate([a, b], [{ taskId: "a", date: "2026-11-04", status: "DONE" }], "2026-11-04", "2026-11-04");
    expect(dayProgress(rows)).toEqual({ done: 1, total: 2 });
    const label = (k: string) => `on ${k}`;
    expect(carriedLabel("2026-11-03", "2026-11-04", label)).toBe("from yesterday");
    expect(carriedLabel("2026-11-02", "2026-11-04", label)).toBe("from on 2026-11-02");
  });
});
