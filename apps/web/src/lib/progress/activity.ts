import { addDays, isWeekend, mondayOf, weekdayOf, type DayKey } from "./days";

/** Drafts started per local day (documents created), the only activity Orbit can count today. */
export type DraftsByDay = Record<DayKey, number>;

const has = (drafts: DraftsByDay, key: DayKey) => (drafts[key] ?? 0) > 0;

/**
 * The one streak Orbit shows (Activities and the sprint): weekdays in a row with at least one draft, ending today, or
 * at the last weekday when today has no draft yet. Weekends neither break it nor add to it. `from` limits it to days
 * on or after a date (the sprint's start).
 */
export function weekdayStreak(drafts: DraftsByDay, today: DayKey, from?: DayKey): number {
  let cursor = has(drafts, today) && !isWeekend(today) ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < 800 && (!from || cursor >= from); i++, cursor = addDays(cursor, -1)) {
    if (isWeekend(cursor)) continue;
    if (!has(drafts, cursor)) break;
    streak++;
  }
  return streak;
}

/** The longest streak on record, by the same rules. */
export function bestWeekdayStreak(drafts: DraftsByDay, today: DayKey): number {
  const keys = Object.keys(drafts).filter((k) => has(drafts, k) && k <= today).sort();
  if (!keys.length) return 0;
  let best = 0;
  let run = 0;
  for (let k = keys[0]!; k <= today; k = addDays(k, 1)) {
    if (isWeekend(k)) continue;
    if (has(drafts, k)) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

/** Drafts started from this Monday up to today. */
export function draftsThisWeek(drafts: DraftsByDay, today: DayKey): number {
  let n = 0;
  for (let k = mondayOf(today); k <= today; k = addDays(k, 1)) n += drafts[k] ?? 0;
  return n;
}

/** Whether any Monday-to-Sunday week had drafts on five different days. */
export function hadFullWeek(drafts: DraftsByDay): boolean {
  const perWeek = new Map<DayKey, number>();
  for (const k of Object.keys(drafts)) {
    if (!has(drafts, k)) continue;
    const m = mondayOf(k);
    perWeek.set(m, (perWeek.get(m) ?? 0) + 1);
  }
  return [...perWeek.values()].some((n) => n >= 5);
}

export type StripDay = { key: DayKey; weekday: string; date: number; drafts: number; when: "past" | "today" | "future" };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The Monday-first week `offset` weeks from this one, with drafts per day. */
export function weekStrip(drafts: DraftsByDay, today: DayKey, offset: number): StripDay[] {
  const monday = addDays(mondayOf(today), offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(monday, i);
    return {
      key,
      weekday: WD[weekdayOf(key)]!,
      date: Number(key.slice(8)),
      drafts: key > today ? 0 : (drafts[key] ?? 0),
      when: key < today ? "past" : key === today ? "today" : "future",
    };
  });
}

export type MilestoneId = "first-draft" | "streak-3" | "full-week" | "ten-drafts";
export type Milestone = { id: MilestoneId; title: string; detail: string; current: number; target: number; earned: boolean };

/** Badges Orbit can award honestly from draft history. Order is the suggested path. */
export function milestones({ total, best, fullWeek }: { total: number; best: number; fullWeek: boolean }): Milestone[] {
  const m = (id: MilestoneId, title: string, detail: string, current: number, target: number): Milestone => ({
    id,
    title,
    detail,
    current: Math.min(current, target),
    target,
    earned: current >= target,
  });
  return [
    m("first-draft", "First draft", "Start your first post with Orbit.", total, 1),
    m("streak-3", "Three in a row", "Draft on three weekdays in a row.", best, 3),
    m("full-week", "Full week", "Draft on five days in one week.", fullWeek ? 1 : 0, 1),
    m("ten-drafts", "Ten drafts", "Start ten posts.", total, 10),
  ];
}

export function nextMilestone(list: Milestone[]): (Milestone & { toGo: number }) | null {
  const next = list.find((m) => !m.earned);
  return next ? { ...next, toGo: next.target - next.current } : null;
}

export type ChecklistItem = { id: string; title: string; detail: string; action: string; href: string; done: boolean };

/** Getting started, mapped to steps that exist in Orbit today; each row is done only when the data says so. */
export function gettingStarted(s: { strategy: boolean; identity: boolean; knowledge: boolean; voice: boolean; drafts: number }) {
  const items: ChecklistItem[] = [
    {
      id: "strategy",
      title: "Build your content strategy",
      detail: "Orbit turns what it knows about you into positioning, a content mix and an audience plan.",
      action: "Build",
      href: "/strategy",
      done: s.strategy,
    },
    {
      id: "about-you",
      title: "Tell Orbit about you",
      detail: "Your role, your story and what you're known for, saved as memories.",
      action: "Open",
      href: "/settings/memories",
      done: s.identity,
    },
    {
      id: "knowledge",
      title: "Connect your knowledge",
      detail: "Add notes, documents or links Orbit can draw on when it writes.",
      action: "Open",
      href: "/knowledge-base",
      done: s.knowledge,
    },
    {
      id: "voice",
      title: "Teach Orbit your voice",
      detail: "Paste three of your posts from the voice menu in the composer.",
      action: "Set it up",
      href: "/",
      done: s.voice,
    },
    {
      id: "first-draft",
      title: "Write your first draft",
      detail: "Start from an idea, a note or today's sprint format.",
      action: "Write",
      href: "/",
      done: s.drafts > 0,
    },
  ];
  return { items, done: items.filter((i) => i.done).length };
}
