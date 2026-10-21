import { FORMATS, type Format } from "@brandloop/ai";

/** What the home "Your week" card shows from the saved strategy: titles only, never invented rows. */
export type StrategySummary = { slots: { day: string; title: string }[] };
export type LatestChat = { id: string; title: string; lastActivityAt: string };

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

function weekdayIn(date: Date, timeZone: string): number {
  const fmt = (tz: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(date).toLowerCase();
  let short: string;
  try {
    short = fmt(timeZone);
  } catch {
    short = fmt("UTC");
  }
  return Math.max(0, WEEKDAYS.indexOf(short.slice(0, 3) as (typeof WEEKDAYS)[number]));
}

/**
 * The next three recurring series from today (in the profile's timezone), or, when the plan has no series, its weekly
 * formats by frequency. Null without a strategy.
 */
export function summarizeStrategy(
  row: { recurringSeries: unknown; contentFormats: unknown } | null,
  now: Date,
  timeZone: string,
): StrategySummary | null {
  if (!row) return null;
  const today = weekdayIn(now, timeZone);
  const series = list(row.recurringSeries)
    .filter((s) => typeof s.name === "string" && s.name.trim() && WEEKDAYS.includes(s.weekday as never))
    .map((s) => ({ name: (s.name as string).trim(), day: WEEKDAYS.indexOf(s.weekday as (typeof WEEKDAYS)[number]) }))
    .sort((a, b) => ((a.day - today + 7) % 7) - ((b.day - today + 7) % 7));
  if (series.length) {
    return { slots: series.slice(0, 3).map((s) => ({ day: DAY_LABEL[WEEKDAYS[s.day]!], title: s.name })) };
  }
  const formats = list(row.contentFormats)
    .filter((f) => typeof f.format === "string" && f.format in FORMATS && typeof f.perWeek === "number" && f.perWeek > 0)
    .sort((a, b) => (b.perWeek as number) - (a.perWeek as number));
  return {
    slots: formats.slice(0, 3).map((f) => ({ day: `${f.perWeek} a week`, title: FORMATS[f.format as Format].label })),
  };
}

/** The most recently active chat (the list puts pinned chats first, so order alone isn't enough). */
export function latestChatOf(chats: { id: string; title: string; lastActivityAt: Date }[]): LatestChat | null {
  const latest = chats.reduce<(typeof chats)[number] | null>(
    (best, c) => (!best || c.lastActivityAt > best.lastActivityAt ? c : best),
    null,
  );
  return latest && { id: latest.id, title: latest.title, lastActivityAt: latest.lastActivityAt.toISOString() };
}
