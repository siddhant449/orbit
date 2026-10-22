import { promptHref } from "@/lib/prompt-param";

/**
 * Posts screen view models (screens.md B5 / B6): pure functions for the board columns, search, the list, and the
 * week calendar's civil-date math in the profile's timezone. Dates cross the server boundary as ISO strings.
 */

export type PostsView = "board" | "list" | "calendar";

/** A post as the client sees it (`PostSummary` from @brandloop/db with the date serialised). */
export type PostRow = {
  id: string;
  title: string;
  status: "DRAFT";
  version: number;
  text: string;
  chatId: string | null;
  updatedAt: string;
};

export const VIEWS: readonly { value: PostsView; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
];

export function parseView(raw: string | string[] | undefined): PostsView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "list" || v === "calendar" ? v : "board";
}

/** One line under the title: the first non-empty line that isn't the title itself, whitespace collapsed. */
export function excerpt(text: string, title: string, max = 120): string {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const line = lines.find((l) => l !== title.trim()) ?? "";
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export function relativeTime(iso: string, now: Date): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

export function filterPosts<T extends Pick<PostRow, "title" | "text">>(posts: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return posts;
  return posts.filter((p) => {
    const hay = `${p.title}\n${p.text}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export type ColumnId = "all" | "ideas" | "draft" | "scheduled" | "published";
export type BoardColumn = { id: ColumnId; label: string; posts: PostRow[] };

/**
 * Columns follow what the data can say today: `DocumentStatus` has only DRAFT, so Draft holds every post and All posts
 * mirrors it. Ideas, Scheduled and Published have no status behind them yet and stay empty.
 */
export function boardColumns(posts: PostRow[]): BoardColumn[] {
  return [
    { id: "all", label: "All posts", posts },
    { id: "ideas", label: "Ideas", posts: [] },
    { id: "draft", label: "Draft", posts: posts.filter((p) => p.status === "DRAFT") },
    { id: "scheduled", label: "Scheduled", posts: [] },
    { id: "published", label: "Published", posts: [] },
  ];
}

/* ------------------------------------------------------------------ Calendar */

const pad = (n: number) => String(n).padStart(2, "0");

/** Text sent to the client per post (excerpt and search only), in code points. */
export const CLIENT_TEXT_MAX = 2500;

export function clipText(text: string, max = CLIENT_TEXT_MAX): string {
  if (text.length <= max) return text;
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

/** The profile's timezone if the runtime knows it, otherwise UTC (a bad value must not break the screen). */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Wall-clock date (YYYY-MM-DD), hour and minute of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { date: `${get("year")}-${pad(get("month"))}-${pad(get("day"))}`, hour: get("hour") % 24, minute: get("minute") };
}

export const todayIn = (now: Date, timeZone: string) => zonedParts(now, timeZone).date;

const toUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fromUTC = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** The Monday on or before `iso`. */
export function weekStartOf(iso: string): string {
  const dow = toUTC(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Weeks the calendar will show: real dates in a sane range, so week arithmetic never leaves 4-digit years. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2999;
const isRealDate = (iso: string) => {
  if (!ISO_DATE.test(iso)) return false;
  const year = Number(iso.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const d = toUTC(iso);
  return !Number.isNaN(d.getTime()) && fromUTC(d) === iso;
};

/** `?week=` to its Monday; today's week when missing or not a real date. */
export function parseWeek(raw: string | string[] | undefined, todayISO: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return weekStartOf(v && isRealDate(v) ? v : todayISO);
}

export type WeekDay = { iso: string; weekday: string; day: number; month: string; year: number };

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

export function weekDays(mondayISO: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(mondayISO, i);
    const d = toUTC(iso);
    return { iso, weekday: weekdayFmt.format(d), day: d.getUTCDate(), month: monthFmt.format(d), year: d.getUTCFullYear() };
  });
}

/** "October" + "2026", or a span when the week crosses a month (and a year). */
export function monthLabel(days: WeekDay[]): { month: string; year: string } {
  const a = days[0]!;
  const b = days[days.length - 1]!;
  if (a.month === b.month) return { month: a.month, year: String(a.year) };
  if (a.year === b.year) return { month: `${a.month} – ${b.month}`, year: String(b.year) };
  return { month: `${a.month} ${a.year} – ${b.month}`, year: String(b.year) };
}

/** "GMT+5:30 · Asia/Kolkata" (the offset on `at`, so DST is right for the week shown). */
export function gmtLabel(timeZone: string, at: Date): string {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")
      ?.value ?? "GMT";
  return `${offset.replace(/^GMT[+-]0(:00)?$/, "GMT")} · ${timeZone}`;
}

export const hourLabel = (hour: number) => `${hour}:00`;
export const slotKey = (iso: string, hour: number) => `${iso}|${hour}`;

/** Posts keyed by the day and hour they were last edited, for the days shown. Newest edit last within a slot. */
export function placeByLastEdit(posts: PostRow[], days: WeekDay[], timeZone: string): Map<string, PostRow[]> {
  const shown = new Set(days.map((d) => d.iso));
  const out = new Map<string, PostRow[]>();
  const sorted = [...posts].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const p of sorted) {
    const { date, hour } = zonedParts(new Date(p.updatedAt), timeZone);
    if (!shown.has(date)) continue;
    const key = slotKey(date, hour);
    out.set(key, [...(out.get(key) ?? []), p]);
  }
  return out;
}

/** A slot can be planned until it ends: the current hour still counts. */
export function slotIsPlannable(iso: string, hour: number, now: Date, timeZone: string): boolean {
  const n = zonedParts(now, timeZone);
  return iso > n.date || (iso === n.date && hour >= n.hour);
}

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function planPrompt(iso: string, hour: number, timeZone: string): string {
  const [weekday, ...rest] = longDate.format(toUTC(iso)).split(" ");
  return `Help me draft a LinkedIn post I plan to publish on ${weekday!.replace(/,$/, "")}, ${rest.join(" ")} at ${hourLabel(hour)} (${timeZone}). It's about `;
}

/** Home, with the composer pre-filled: the writer finishes the topic and sends it to start the draft's chat. */
export const planHref = (iso: string, hour: number, timeZone: string) => promptHref(planPrompt(iso, hour, timeZone));

export type Slot = { day: number; hour: number };

/** Roving focus across the 7 × 24 slot grid. */
export function moveSlot(slot: Slot, key: string): Slot | null {
  const clampH = (h: number) => Math.min(23, Math.max(0, h));
  const clampD = (d: number) => Math.min(6, Math.max(0, d));
  switch (key) {
    case "ArrowRight":
      return { ...slot, day: clampD(slot.day + 1) };
    case "ArrowLeft":
      return { ...slot, day: clampD(slot.day - 1) };
    case "ArrowDown":
      return { ...slot, hour: clampH(slot.hour + 1) };
    case "ArrowUp":
      return { ...slot, hour: clampH(slot.hour - 1) };
    case "Home":
      return { ...slot, day: 0 };
    case "End":
      return { ...slot, day: 6 };
    case "PageDown":
      return { ...slot, hour: clampH(slot.hour + 6) };
    case "PageUp":
      return { ...slot, hour: clampH(slot.hour - 6) };
    default:
      return null;
  }
}

/** The phone agenda's one "Plan a post" per day: 9:00 on future days, the next whole hour today, none in the past. */
export function agendaPlanHour(iso: string, now: Date, timeZone: string): number | null {
  const n = zonedParts(now, timeZone);
  if (iso > n.date) return 9;
  if (iso < n.date || n.hour >= 23) return null;
  return n.hour + 1;
}
