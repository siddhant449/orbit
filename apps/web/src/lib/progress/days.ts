/**
 * Calendar days as `YYYY-MM-DD` keys in the profile's timezone. Keys compare as strings and do date maths in UTC,
 * so day boundaries come only from `dayKeyIn` and nothing drifts with the server's own zone.
 */
export type DayKey = string;

const MS_DAY = 86_400_000;

function partsIn(date: Date, timeZone: string) {
  const make = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = make(timeZone);
  } catch {
    fmt = make("UTC");
  }
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour), m: Number(p.minute), s: Number(p.second) };
}

export function dayKeyIn(date: Date, timeZone: string): DayKey {
  return partsIn(date, timeZone).key;
}

const toUtc = (key: DayKey) => Date.parse(`${key}T00:00:00Z`);
const fromUtc = (ms: number): DayKey => new Date(ms).toISOString().slice(0, 10);

export function addDays(key: DayKey, n: number): DayKey {
  return fromUtc(toUtc(key) + n * MS_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DayKey): number {
  return new Date(toUtc(key)).getUTCDay();
}

export function isWeekend(key: DayKey): boolean {
  const d = weekdayOf(key);
  return d === 0 || d === 6;
}

/** Weeks run Monday to Sunday. */
export function mondayOf(key: DayKey): DayKey {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

export function countByDay(dates: Date[], timeZone: string): Record<DayKey, number> {
  const out: Record<DayKey, number> = {};
  for (const d of dates) {
    const k = dayKeyIn(d, timeZone);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** "Thu 22 Oct", or "22 Oct" without the weekday. */
export function dayLabel(key: DayKey, { weekday = true }: { weekday?: boolean } = {}): string {
  const d = new Date(toUtc(key));
  const day = d.getUTCDate();
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(d);
  const wd = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d);
  return weekday ? `${wd} ${day} ${month}` : `${day} ${month}`;
}

/** Time left in the profile's local day: "resets in 7h", or minutes in the last hour. */
export function resetsIn(now: Date, timeZone: string): string {
  const { h, m, s } = partsIn(now, timeZone);
  const left = 86_400 - (h * 3600 + m * 60 + s);
  if (left < 3600) return `resets in ${Math.max(1, Math.round(left / 60))}m`;
  return `resets in ${Math.floor(left / 3600)}h`;
}
