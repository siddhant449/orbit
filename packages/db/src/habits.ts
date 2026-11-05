/**
 * Pure rules for weekly goals and badges. No database here: the web app imports this through `@brandloop/db/habits`
 * (it must not pull Prisma into the browser) and the badge service uses it to decide what to award.
 */

export type GoalValues = { posts: number; comments: number; dms: number; connections: number };
export type GoalPresetId = "momentum" | "growth" | "creator";

export const GOAL_PRESETS: Record<GoalPresetId, GoalValues> = {
  momentum: { posts: 3, comments: 25, dms: 5, connections: 10 },
  growth: { posts: 5, comments: 50, dms: 10, connections: 50 },
  creator: { posts: 7, comments: 70, dms: 15, connections: 35 },
};
export const DEFAULT_PRESET: GoalPresetId = "growth";
export const GOAL_LIMITS: Record<keyof GoalValues, { min: number; max: number }> = {
  posts: { min: 1, max: 14 },
  comments: { min: 0, max: 500 },
  dms: { min: 0, max: 200 },
  connections: { min: 0, max: 500 },
};

/**
 * Weeks run oldest to newest; the last one is this week. The streak is the run of met weeks that ends last week, plus
 * this week when it is already met. An unmet week breaks the run. A goal of zero never counts as met.
 */
export function weekStreak(weeks: { posted: number; goal: number }[]): number {
  const met = (w: { posted: number; goal: number }) => w.goal > 0 && w.posted >= w.goal;
  if (weeks.length === 0) return 0;
  let streak = met(weeks[weeks.length - 1]!) ? 1 : 0;
  for (let i = weeks.length - 2; i >= 0 && met(weeks[i]!); i--) streak++;
  return streak;
}

const MS_DAY = 86_400_000;
const toMs = (k: string) => Date.parse(`${k}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addKeyDays = (k: string, n: number) => fromMs(toMs(k) + n * MS_DAY);
/** Monday of the week a `YYYY-MM-DD` key falls in. */
export const mondayOfKey = (k: string) => addKeyDays(k, -((new Date(toMs(k)).getUTCDay() + 6) % 7));

/** Posts per Monday-to-Sunday week for the last `count` weeks, oldest first, the last being this week (up to `today`). */
export function postedByWeek(perDay: Record<string, number>, today: string, count: number): number[] {
  const thisMonday = mondayOfKey(today);
  return Array.from({ length: count }, (_, i) => {
    const monday = addKeyDays(thisMonday, -7 * (count - 1 - i));
    let n = 0;
    for (let d = 0; d < 7; d++) {
      const k = addKeyDays(monday, d);
      if (k <= today) n += perDay[k] ?? 0;
    }
    return n;
  });
}

/** Whether any Monday-to-Sunday week has posts on five different days. */
export function hadFullWeek(perDay: Record<string, number>): boolean {
  const days = new Map<string, number>();
  for (const [k, n] of Object.entries(perDay)) if (n > 0) days.set(mondayOfKey(k), (days.get(mondayOfKey(k)) ?? 0) + 1);
  return [...days.values()].some((n) => n >= 5);
}

export type BadgeSignals = {
  /** Posts marked as posted, ever. */
  posted: number;
  fullWeek: boolean;
  /** Current weekly-goal streak. */
  weekStreak: number;
  challengeFinished: boolean;
  ownTemplates: number;
  spaces: number;
  ideasDrafted: number;
};

export type BadgeDef = { id: string; label: string; detail: string; target: number; current: (s: BadgeSignals) => number };

const flag = (b: boolean) => (b ? 1 : 0);

/** Badges in the order they are suggested. `current / target` is the progress shown while locked. */
export const BADGES: readonly BadgeDef[] = [
  { id: "first-post", label: "First post", detail: "Mark your first post as posted.", target: 1, current: (s) => s.posted },
  { id: "posts-5", label: "5 posts", detail: "Mark five posts as posted.", target: 5, current: (s) => s.posted },
  { id: "posts-10", label: "10 posts", detail: "Mark ten posts as posted.", target: 10, current: (s) => s.posted },
  { id: "posts-25", label: "25 posts", detail: "Mark twenty-five posts as posted.", target: 25, current: (s) => s.posted },
  { id: "first-full-week", label: "First full week", detail: "Post on five different days in one week.", target: 1, current: (s) => flag(s.fullWeek) },
  { id: "streak-4", label: "4-week streak", detail: "Meet your posts goal four weeks in a row.", target: 4, current: (s) => s.weekStreak },
  { id: "challenge-finished", label: "Challenge finished", detail: "Reach the end of a 30-day challenge.", target: 1, current: (s) => flag(s.challengeFinished) },
  { id: "first-template", label: "First template", detail: "Make a template of your own.", target: 1, current: (s) => s.ownTemplates },
  { id: "first-space", label: "First space", detail: "Create a space in your library.", target: 1, current: (s) => s.spaces },
  { id: "ideas-drafted-10", label: "10 ideas drafted", detail: "Turn ten ideas into drafts.", target: 10, current: (s) => s.ideasDrafted },
];

export function earnedBadges(signals: BadgeSignals): string[] {
  return BADGES.filter((b) => b.current(signals) >= b.target).map((b) => b.id);
}

export type BadgeProgress = { id: string; label: string; detail: string; current: number; target: number; earned: boolean };

/** Every badge with progress toward it; `awarded` (stored) wins over the live signals, so an earned badge never locks again. */
export function badgeProgress(signals: BadgeSignals, awarded: ReadonlySet<string> = new Set()): BadgeProgress[] {
  return BADGES.map((b) => {
    const current = Math.min(b.current(signals), b.target);
    return { id: b.id, label: b.label, detail: b.detail, current: awarded.has(b.id) ? b.target : current, target: b.target, earned: awarded.has(b.id) || current >= b.target };
  });
}
