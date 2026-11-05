import { randomUUID } from "node:crypto";
import { prisma } from "../client";
import { Prisma } from "../generated/prisma/client";
import { deleteChat, getChat, getOrCreateChat, renameChat } from "./chat";

/** The stored 30-day challenge. Everything is per profile; another profile's challenge or day is not found. */

export const CHALLENGE_DAYS = 30;
const MS_DAY = 86_400_000;

export type ChallengeErrorCode = "conflict" | "not_found" | "invalid";
export class ChallengeError extends Error {
  readonly code: ChallengeErrorCode;
  constructor(code: ChallengeErrorCode, message?: string) {
    super(message ?? (code === "conflict" ? "A challenge is already running." : code === "not_found" ? "Challenge not found." : "Invalid challenge request."));
    this.name = "ChallengeError";
    this.code = code;
  }
}

const dayDate = (key: string) => new Date(`${key}T00:00:00Z`);
const key = (d: Date) => d.toISOString().slice(0, 10);
export const addDayKey = (k: string, n: number) => key(new Date(dayDate(k).getTime() + n * MS_DAY));
const isWeekendKey = (k: string) => [0, 6].includes(dayDate(k).getUTCDay());
const validKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && key(dayDate(v)) === v;

/** The profile's local calendar day at `now` (UTC when the zone is unknown). */
export function localDayKey(now: Date, timeZone: string): string {
  const make = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = make(timeZone);
  } catch {
    fmt = make("UTC");
  }
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export type LayoutDay = { dayNumber: number; date: string; formatId: string | null };

/**
 * The 30 calendar days from `startDate`: weekdays take the formats in order, weekends are rest days (no format).
 * Thirty days hold at most 22 weekdays, so 22 formats always cover them; a weekday past the last format would be a rest day.
 */
export function layoutChallenge(startDate: string, formatIds: readonly string[]): LayoutDay[] {
  let next = 0;
  return Array.from({ length: CHALLENGE_DAYS }, (_, i) => {
    const date = addDayKey(startDate, i);
    return { dayNumber: i + 1, date, formatId: isWeekendKey(date) ? null : (formatIds[next++] ?? null) };
  });
}

export type ChallengeDayRow = {
  dayNumber: number;
  date: string;
  formatId: string | null;
  chatId: string | null;
  /** The day's live post (the day chat's document), or null when there is none or it was deleted. */
  doc: { id: string; title: string; postedAt: Date | null } | null;
};

export type ActiveChallenge = {
  id: string;
  startDate: string;
  finishDate: string;
  /** The profile's local day when this was read. */
  today: string;
  endedAt: Date | null;
  completedAt: Date | null;
  days: ChallengeDayRow[];
};

type Tx = Prisma.TransactionClient;

async function profileZone(db: Tx | typeof prisma, profileId: string): Promise<string> {
  const p = await db.profile.findUnique({ where: { id: profileId }, select: { timezone: true } });
  return p?.timezone || "UTC";
}

/** The newest enrollment that hasn't been ended: running, or completed and waiting to be dismissed. `includeEnded` also takes an ended one. */
function latestOpen(db: Tx | typeof prisma, profileId: string, includeEnded = false) {
  return db.challengeEnrollment.findFirst({
    where: includeEnded ? { profileId } : { profileId, endedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

/** Sets `completedAt` once the 30th day is behind the profile's local today. Conditional, so it happens once. */
async function completeIfOver(db: Tx | typeof prisma, e: { id: string; startDate: Date; completedAt: Date | null }, today: string, now: Date): Promise<Date | null> {
  if (e.completedAt) return e.completedAt;
  if (today <= addDayKey(key(e.startDate), CHALLENGE_DAYS - 1)) return null;
  await db.challengeEnrollment.updateMany({ where: { id: e.id, completedAt: null }, data: { completedAt: now } });
  return (await db.challengeEnrollment.findUnique({ where: { id: e.id }, select: { completedAt: true } }))?.completedAt ?? now;
}

/**
 * Starts a challenge on `startDate` (YYYY-MM-DD, within two months back or three months ahead of today). `formatIds`
 * are the posting-day formats in order. A running challenge is `conflict`; a finished one (30 days over) is archived.
 * Two parallel starts create one: the partial unique index in the migration rejects the second.
 */
export async function startChallenge(profileId: string, startDate: string, formatIds: readonly string[], now = new Date()): Promise<ActiveChallenge> {
  if (!validKey(startDate)) throw new ChallengeError("invalid", "Choose a start date.");
  const today = localDayKey(now, await profileZone(prisma, profileId));
  if (startDate < addDayKey(today, -60) || startDate > addDayKey(today, 90)) throw new ChallengeError("invalid", "Choose a start date within the next three months.");
  const days = layoutChallenge(startDate, formatIds);
  if (days.filter((d) => d.formatId).length < days.filter((d) => !isWeekendKey(d.date)).length) throw new ChallengeError("invalid", "Not enough formats for the weekdays.");
  try {
    await prisma.$transaction(async (tx) => {
      const open = await latestOpen(tx, profileId);
      if (open) {
        if (!(await completeIfOver(tx, open, today, now))) throw new ChallengeError("conflict");
        await tx.challengeEnrollment.updateMany({ where: { profileId, endedAt: null }, data: { endedAt: now } });
      }
      const created = await tx.challengeEnrollment.create({ data: { profileId, startDate: dayDate(startDate) } });
      await tx.challengeDay.createMany({
        data: days.map((d) => ({ enrollmentId: created.id, dayNumber: d.dayNumber, date: dayDate(d.date), formatId: d.formatId })),
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ChallengeError("conflict");
    throw err;
  }
  return (await getActiveChallenge(profileId, now))!;
}

/**
 * The running (or just-finished, not yet ended) challenge with its days. Each day carries its post through the day's
 * chat, with `postedAt`. Past the 30th day `completedAt` is set here, once. With `includeEnded`, a challenge the writer
 * ended is returned too (for the summary page), so the newest one always shows.
 */
export async function getActiveChallenge(profileId: string, now = new Date(), opts: { includeEnded?: boolean } = {}): Promise<ActiveChallenge | null> {
  const open = await latestOpen(prisma, profileId, opts.includeEnded);
  if (!open) return null;
  const today = localDayKey(now, await profileZone(prisma, profileId));
  const [completedAt, days] = await Promise.all([
    open.endedAt ? Promise.resolve(open.completedAt) : completeIfOver(prisma, open, today, now),
    prisma.challengeDay.findMany({ where: { enrollmentId: open.id }, orderBy: { dayNumber: "asc" } }),
  ]);
  const chatIds = days.flatMap((d) => (d.chatId ? [d.chatId] : []));
  const chats = chatIds.length
    ? await prisma.chat.findMany({
        where: { id: { in: chatIds }, profileId, deletedAt: null },
        select: { id: true, document: { select: { id: true, title: true, postedAt: true, deletedAt: true } } },
      })
    : [];
  const docOf = new Map(chats.map((c) => [c.id, c.document && !c.document.deletedAt ? { id: c.document.id, title: c.document.title, postedAt: c.document.postedAt } : null]));
  return {
    id: open.id,
    startDate: key(open.startDate),
    finishDate: addDayKey(key(open.startDate), CHALLENGE_DAYS - 1),
    today,
    endedAt: open.endedAt,
    completedAt,
    days: days.map((d) => ({
      dayNumber: d.dayNumber,
      date: key(d.date),
      formatId: d.formatId,
      chatId: d.chatId,
      doc: d.chatId ? (docOf.get(d.chatId) ?? null) : null,
    })),
  };
}

/** Ends the running (or finished) challenge. False when there is none. */
export async function endChallenge(profileId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.challengeEnrollment.updateMany({ where: { profileId, endedAt: null }, data: { endedAt: now } });
  return count > 0;
}

/**
 * The day's chat: created on first use, then the same one every time (parallel opens settle on one). Rest days, days that
 * haven't started and a finished challenge can't be opened. `title` names a new chat.
 */
export async function openChallengeDay(
  profileId: string,
  userId: string,
  dayNumber: number,
  opts: { title?: string; now?: Date } = {},
): Promise<{ chatId: string; created: boolean }> {
  const now = opts.now ?? new Date();
  const open = await latestOpen(prisma, profileId);
  if (!open) throw new ChallengeError("not_found", "No challenge is running.");
  const day = await prisma.challengeDay.findUnique({ where: { enrollmentId_dayNumber: { enrollmentId: open.id, dayNumber } } });
  if (!day) throw new ChallengeError("not_found", "That day isn't in your challenge.");
  const today = localDayKey(now, await profileZone(prisma, profileId));
  if (await completeIfOver(prisma, open, today, now)) throw new ChallengeError("invalid", "This challenge is finished.");
  if (!day.formatId) throw new ChallengeError("invalid", "Rest days have no post planned.");
  if (key(day.date) > today) throw new ChallengeError("invalid", "That day hasn't started yet.");
  if (day.chatId && (await getChat(profileId, day.chatId))) return { chatId: day.chatId, created: false };

  const chatId = randomUUID();
  await getOrCreateChat(profileId, userId, chatId);
  if (opts.title) await renameChat(profileId, chatId, opts.title.slice(0, 120));
  // First writer wins: the day takes our chat only if it still holds the chat we saw (none, or the deleted one).
  const { count } = await prisma.challengeDay.updateMany({ where: { id: day.id, chatId: day.chatId }, data: { chatId } });
  if (count > 0) return { chatId, created: true };
  await deleteChat(profileId, chatId).catch(() => {});
  const winner = await prisma.challengeDay.findUnique({ where: { id: day.id }, select: { chatId: true } });
  if (!winner?.chatId) throw new ChallengeError("not_found");
  return { chatId: winner.chatId, created: false };
}

/** The challenge day a chat belongs to (for seeding its first message), or null. */
export async function getChallengeDayByChat(profileId: string, chatId: string): Promise<{ dayNumber: number; formatId: string | null } | null> {
  const day = await prisma.challengeDay.findFirst({
    where: { chatId, enrollment: { profileId, endedAt: null } },
    select: { dayNumber: true, formatId: true },
  });
  return day ?? null;
}

/** Challenges that reached their 30th day (the "challenge finished" badge). */
export async function countCompletedChallenges(profileId: string): Promise<number> {
  return prisma.challengeEnrollment.count({ where: { profileId, completedAt: { not: null } } });
}

/**
 * Running challenges whose last day is `daysLeft` days away in their profile's own zone (the daily reminder). Only
 * enrollments started 26 to 29 days ago can match, so the scan stays small.
 */
export async function listEndingChallenges(now = new Date(), daysLeft = 3): Promise<{ enrollmentId: string; profileId: string }[]> {
  const utcToday = key(now);
  const rows = await prisma.challengeEnrollment.findMany({
    where: {
      endedAt: null,
      completedAt: null,
      startDate: { gte: dayDate(addDayKey(utcToday, -(CHALLENGE_DAYS - 1) - 2)), lte: dayDate(addDayKey(utcToday, -(CHALLENGE_DAYS - 1 - daysLeft) + 2)) },
      profile: { deletedAt: null },
    },
    take: 1000,
    select: { id: true, profileId: true, startDate: true, profile: { select: { timezone: true } } },
  });
  return rows
    .filter((r) => addDayKey(key(r.startDate), CHALLENGE_DAYS - 1 - daysLeft) === localDayKey(now, r.profile.timezone || "UTC"))
    .map((r) => ({ enrollmentId: r.id, profileId: r.profileId }));
}
