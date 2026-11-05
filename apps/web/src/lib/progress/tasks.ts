import { addDays, type DayKey } from "./days";

export type TaskRepeat = "once" | "weekdays" | "weekly";
export const MAX_PAUSE_DAYS = 28;

export type TaskLike = {
  id: string;
  title: string;
  note: string | null;
  repeat: TaskRepeat;
  /** 1 = Monday … 7 = Sunday; set for weekly tasks. */
  weekday: number | null;
  position: number;
  /** Hidden up to and including this day. */
  pausedUntil: DayKey | null;
  /** The local day the task was made. */
  createdOn: DayKey;
};
export type DoneLike = { taskId: string; date: DayKey; status: "DONE" | "SKIPPED" };
export type TaskRow<T extends TaskLike = TaskLike> = { task: T; carriedOver: boolean; status: "open" | "done" | "skipped" };

/** 1 = Monday … 7 = Sunday. */
export const isoWeekday = (key: DayKey) => new Date(`${key}T00:00:00Z`).getUTCDay() || 7;

/**
 * The to-dos on `date`, in the writer's order. A one-off shows on the day it was made and, while it is still not done,
 * carries over to today. Weekday and weekly tasks repeat from the day they were made and never carry. A paused task is
 * hidden until its pause ends. A skipped task comes back with status "skipped" so it can be undone; days don't count it.
 */
export function tasksForDate<T extends TaskLike>(tasks: T[], dones: DoneLike[], date: DayKey, today: DayKey): TaskRow<T>[] {
  const byTask = new Map<string, DoneLike[]>();
  for (const d of dones) byTask.set(d.taskId, [...(byTask.get(d.taskId) ?? []), d]);
  const rows: TaskRow<T>[] = [];
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    if (task.pausedUntil && date <= task.pausedUntil) continue;
    const mine = byTask.get(task.id) ?? [];
    let shown = false;
    let carriedOver = false;
    if (task.repeat === "once") {
      if (date === task.createdOn) shown = true;
      else if (date === today && task.createdOn < today && !mine.some((d) => d.status === "DONE" && d.date < today)) shown = carriedOver = true;
    } else if (date >= task.createdOn) {
      shown = task.repeat === "weekdays" ? isoWeekday(date) <= 5 : isoWeekday(date) === task.weekday;
    }
    if (!shown) continue;
    const rec = mine.find((d) => d.date === date);
    rows.push({ task, carriedOver, status: rec ? (rec.status === "DONE" ? "done" : "skipped") : "open" });
  }
  return rows;
}

/** Done of total for a day; skipped to-dos are left out of both. */
export function dayProgress(rows: TaskRow[]): { done: number; total: number } {
  const live = rows.filter((r) => r.status !== "skipped");
  return { done: live.filter((r) => r.status === "done").length, total: live.length };
}

/** "from yesterday" or "from Tue 3 Nov" for a carried-over one-off. */
export function carriedLabel(createdOn: DayKey, today: DayKey, label: (k: DayKey) => string): string {
  return createdOn === addDays(today, -1) ? "from yesterday" : `from ${label(createdOn)}`;
}

/** The day a pause of `days` (1 to 28) lasts to, counted from today, or null when `days` is out of range. */
export function pauseUntil(today: DayKey, days: number): DayKey | null {
  return Number.isInteger(days) && days >= 1 && days <= MAX_PAUSE_DAYS ? addDays(today, days) : null;
}

/** A pause end the server accepts: after today and at most 28 days out. */
export function validPause(today: DayKey, until: DayKey): boolean {
  return until > today && until <= addDays(today, MAX_PAUSE_DAYS);
}
