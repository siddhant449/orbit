/**
 * Real numbers Orbit can show before LinkedIn is connected, derived from the profile's own documents and their saved
 * versions (ai-core Tasks 8-10). Everything is counted in the profile's timezone. No LinkedIn data here.
 */

export type Range = 7 | 30 | 90;
export const RANGES: readonly Range[] = [7, 30, 90];

export type ActivityInput = {
  now: Date;
  timeZone: string;
  documents: { createdAt: Date }[];
  versions: { createdAt: Date; source: string }[];
};

export type Streak = { current: number; best: number; wroteToday: boolean };

export type LocalActivity = {
  range: Range;
  postsDrafted: { current: number; previous: number };
  /** Saved versions after the first draft: user edits, applied suggestions, restores, AI edits. */
  revisions: { current: number; previous: number };
  activeDays: { current: number; of: number };
  series: { dates: string[]; current: number[]; previous: number[] };
  /** Mon..Sun × six four-hour blocks starting at midnight, versions saved in the range. */
  writingTimes: number[][];
  hasWriting: boolean;
};

export const WRITING_BLOCKS = ["0", "4", "8", "12", "16", "20"] as const;
export const WEEKDAY_ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day ("YYYY-MM-DD") of `date` in `timeZone`; unknown zones fall back to UTC. */
export function dayKey(date: Date, timeZone: string): string {
  const tz = safeZone(timeZone);
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(tz, f);
  }
  return f.format(date);
}

/** Weekday (0 = Monday) and hour (0-23) of `date` in `timeZone`. */
function weekdayHour(date: Date, timeZone: string): { weekday: number; hour: number } {
  const tz = safeZone(timeZone);
  let f = partFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" });
    partFormatters.set(tz, f);
  }
  const parts = f.formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday: Math.max(0, WEEKDAY_ROWS.indexOf(wd as (typeof WEEKDAY_ROWS)[number])), hour };
}

/** Shift a day key by whole days (calendar arithmetic in UTC, so DST never skews it). */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Consecutive days with at least one saved version, ending today (or yesterday, while today is still open). */
export function writingStreak(dates: Date[], now: Date, timeZone: string): Streak {
  const days = new Set(dates.map((d) => dayKey(d, timeZone)));
  const today = dayKey(now, timeZone);
  const wroteToday = days.has(today);
  let current = 0;
  for (let k = wroteToday ? today : addDays(today, -1); days.has(k); k = addDays(k, -1)) current++;

  let best = 0;
  for (const k of days) {
    if (days.has(addDays(k, -1))) continue; // not the start of a run
    let run = 0;
    for (let d = k; days.has(d); d = addDays(d, 1)) run++;
    best = Math.max(best, run);
  }
  return { current, best, wroteToday };
}

export function localActivity(range: Range, { now, timeZone, documents, versions }: ActivityInput): LocalActivity {
  const today = dayKey(now, timeZone);
  const start = addDays(today, -(range - 1));
  const prevStart = addDays(start, -range);
  const dates = Array.from({ length: range }, (_, i) => addDays(start, i));
  const index = new Map(dates.map((d, i) => [d, i]));

  const inCurrent = (k: string) => k >= start && k <= today;
  const inPrevious = (k: string) => k >= prevStart && k < start;

  const postsDrafted = { current: 0, previous: 0 };
  for (const d of documents) {
    const k = dayKey(d.createdAt, timeZone);
    if (inCurrent(k)) postsDrafted.current++;
    else if (inPrevious(k)) postsDrafted.previous++;
  }

  const revisions = { current: 0, previous: 0 };
  const current = new Array<number>(range).fill(0);
  const previous = new Array<number>(range).fill(0);
  const writingTimes = WEEKDAY_ROWS.map(() => new Array<number>(WRITING_BLOCKS.length).fill(0));
  const active = new Set<string>();

  for (const v of versions) {
    const k = dayKey(v.createdAt, timeZone);
    const revision = v.source !== "AI_CREATE";
    if (inCurrent(k)) {
      current[index.get(k)!]!++;
      active.add(k);
      if (revision) revisions.current++;
      const { weekday, hour } = weekdayHour(v.createdAt, timeZone);
      writingTimes[weekday]![Math.floor(hour / 4)]!++;
    } else if (inPrevious(k)) {
      previous[index.get(addDays(k, range))!]!++;
      if (revision) revisions.previous++;
    }
  }

  return {
    range,
    postsDrafted,
    revisions,
    activeDays: { current: active.size, of: range },
    series: { dates, current, previous },
    writingTimes,
    hasWriting: versions.length > 0 || documents.length > 0,
  };
}
