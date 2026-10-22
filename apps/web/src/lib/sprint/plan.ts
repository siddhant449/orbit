import { addDays, isWeekend, weekdayOf, type DayKey } from "@/lib/progress/days";
import { SPRINT_FORMATS, type SprintFormat } from "./curriculum";

export const SPRINT_LENGTH = 30;

export type SprintDayStatus = "drafted" | "missed" | "today" | "upcoming" | "rest";

export type SprintDay = {
  /** 1 … 30 */
  day: number;
  key: DayKey;
  kind: "post" | "rest";
  /** The weekday's format; rest days have none. */
  format: SprintFormat | null;
  status: SprintDayStatus;
  /** Drafts started that day (documents created), from existing data. */
  drafts: number;
  isToday: boolean;
};

export type Sprint = {
  start: DayKey;
  finish: DayKey;
  days: SprintDay[];
  /** Empty cells before day 1 in a Monday-first week grid. */
  leadingBlanks: number;
  phase: "upcoming" | "active" | "finished";
  /** Today's day number while the sprint runs, else null. */
  dayNumber: number | null;
  today: SprintDay | null;
  /** What to draft next: today's post day, or the next post day; null once the sprint is over. */
  focus: SprintDay | null;
  postDays: number;
  drafted: number;
  missed: number;
  /** Post days in a row with a draft, ending today (or at the last post day when today has no draft yet). */
  streak: number;
};

/**
 * The 30-day sprint, derived: the calendar from a start date, each weekday's format in order, and per-day status from
 * how many drafts were started that day. Nothing here is stored; a draft is not a published post.
 */
export function buildSprint({ start, today, drafts }: { start: DayKey; today: DayKey; drafts: Record<DayKey, number> }): Sprint {
  let formatIndex = 0;
  const days: SprintDay[] = [];
  for (let i = 0; i < SPRINT_LENGTH; i++) {
    const key = addDays(start, i);
    const rest = isWeekend(key);
    const format = rest ? null : (SPRINT_FORMATS[formatIndex++] ?? null);
    const n = drafts[key] ?? 0;
    const status: SprintDayStatus = rest
      ? "rest"
      : key < today
        ? n > 0
          ? "drafted"
          : "missed"
        : key === today
          ? n > 0
            ? "drafted"
            : "today"
          : "upcoming";
    days.push({ day: i + 1, key, kind: rest ? "rest" : "post", format, status, drafts: rest ? 0 : n, isToday: key === today });
  }

  const finish = days[days.length - 1]!.key;
  const phase = today < start ? "upcoming" : today > finish ? "finished" : "active";
  const todayDay = days.find((d) => d.isToday) ?? null;
  const focus = days.find((d) => d.kind === "post" && d.key >= today) ?? null;
  const post = days.filter((d) => d.kind === "post");

  let streak = 0;
  for (const d of [...post].reverse()) {
    if (d.key > today) continue;
    if (d.key === today && d.drafts === 0) continue;
    if (d.drafts === 0) break;
    streak++;
  }

  return {
    start,
    finish,
    days,
    leadingBlanks: (weekdayOf(start) + 6) % 7,
    phase,
    dayNumber: todayDay?.day ?? null,
    today: todayDay,
    focus,
    postDays: post.length,
    drafted: post.filter((d) => d.status === "drafted").length,
    missed: post.filter((d) => d.status === "missed").length,
    streak,
  };
}

/** A `?start=` value: a real calendar date no more than a year from today either way. */
export function parseStart(value: unknown, today: DayKey): DayKey | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  if (value < addDays(today, -366) || value > addDays(today, 366)) return null;
  return value;
}
