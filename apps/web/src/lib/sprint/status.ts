import { addDays, type DayKey } from "@/lib/progress/days";

/** A challenge day's state. "posted" wins whenever the day's post was marked as posted, on time or late. */
export type DayStatus = "rest" | "upcoming" | "today" | "in_progress" | "posted" | "missed";

export type StatusDay = { date: string; formatId: string | null };
export type StatusDoc = { postedAt: Date | string | null } | null;

/**
 * Rest days (no format) are "rest". A post marked as posted is "posted" even for a missed day posted later. Otherwise a
 * future day is "upcoming"; a day with a draft started is "in_progress"; with nothing, today is "today" and a past
 * weekday is "missed". A deleted post arrives as `null`, so its day reads as missed (or today), never as an error.
 */
export function dayStatus(day: StatusDay, today: string, doc: StatusDoc): DayStatus {
  if (!day.formatId) return "rest";
  if (doc?.postedAt) return "posted";
  if (day.date > today) return "upcoming";
  if (doc) return "in_progress";
  return day.date === today ? "today" : "missed";
}

/** What the page and the sidebar need from the stored challenge, with dates as strings so it can cross to the client. */
export type ChallengeView = {
  id: string;
  startDate: string;
  finishDate: string;
  today: string;
  completedAt: string | null;
  /** Set when the writer ended it. */
  endedAt: string | null;
  days: { dayNumber: number; date: string; formatId: string | null; chatId: string | null; doc: { id: string; title: string; postedAt: string | null } | null }[];
};

export type ChallengeDayView = ChallengeView["days"][number] & { status: DayStatus; isToday: boolean };

export type ChallengeSummary = {
  days: ChallengeDayView[];
  phase: "upcoming" | "active" | "finished";
  /** Today's day number while the challenge runs, else null. */
  dayNumber: number | null;
  postDays: number;
  posted: number;
  missed: number;
  /** Longest run of consecutive weekdays posted (weekends never break it). */
  bestStreak: number;
  /** What to open next: today's day, else the next posting day; null once it's over. */
  focus: ChallengeDayView | null;
};

export function summarizeChallenge(view: ChallengeView): ChallengeSummary {
  const days: ChallengeDayView[] = view.days.map((d) => ({ ...d, status: dayStatus(d, view.today, d.doc), isToday: d.date === view.today }));
  const post = days.filter((d) => d.formatId);
  const phase = view.today < view.startDate ? "upcoming" : view.endedAt || view.completedAt || view.today > view.finishDate ? "finished" : "active";
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (!d.formatId) continue;
    run = d.status === "posted" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return {
    days,
    phase,
    dayNumber: phase === "active" ? (days.find((d) => d.isToday)?.dayNumber ?? null) : null,
    postDays: post.length,
    posted: post.filter((d) => d.status === "posted").length,
    missed: post.filter((d) => d.status === "missed").length,
    bestStreak: best,
    focus: phase === "finished" ? null : (post.find((d) => d.date >= view.today && d.status !== "posted") ?? null),
  };
}

/** Sidebar and bell copy source: "Day N" while active. Null when there is no challenge or it hasn't begun. */
export function sidebarState(view: ChallengeView | null): { day: number; posted: number; total: number } | null {
  if (!view) return null;
  const s = summarizeChallenge(view);
  if (s.phase === "upcoming") return null;
  return { day: s.dayNumber ?? 30, posted: s.posted, total: s.postDays };
}

/** The reminder date: three days before the last day. */
export function reminderDate(finishDate: string): DayKey {
  return addDays(finishDate, -3);
}

