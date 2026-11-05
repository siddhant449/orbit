import { prisma } from "../client";
import { BADGES, badgeProgress, earnedBadges, hadFullWeek, postedByWeek, weekStreak, type BadgeProgress, type BadgeSignals } from "../habits";
import { localDayKey } from "./challenge";
import { getWeeklyGoal } from "./goals";
import { createNotification } from "./notifications";

const WEEKS_BACK = 12;

/** Everything the badges are decided from, read from the profile's own data. */
export async function getBadgeSignals(profileId: string, now = new Date()): Promise<BadgeSignals> {
  const live = { profileId, deletedAt: null };
  const [profile, posted, goal, completed, ownTemplates, spaces, ideasDrafted] = await Promise.all([
    prisma.profile.findUnique({ where: { id: profileId }, select: { timezone: true } }),
    prisma.document.findMany({ where: { ...live, postedAt: { not: null } }, select: { postedAt: true } }),
    getWeeklyGoal(profileId),
    prisma.challengeEnrollment.count({ where: { profileId, completedAt: { not: null } } }),
    prisma.template.count({ where: { profileId, system: false } }),
    prisma.saveSpace.count({ where: { profileId } }),
    prisma.idea.count({ where: { profileId, drafted: true } }),
  ]);
  const tz = profile?.timezone || "UTC";
  const perDay: Record<string, number> = {};
  for (const d of posted) {
    const k = localDayKey(d.postedAt!, tz);
    perDay[k] = (perDay[k] ?? 0) + 1;
  }
  const weeks = postedByWeek(perDay, localDayKey(now, tz), WEEKS_BACK).map((n) => ({ posted: n, goal: goal.posts }));
  return {
    posted: posted.length,
    fullWeek: hadFullWeek(perDay),
    weekStreak: weekStreak(weeks),
    challengeFinished: completed > 0,
    ownTemplates,
    spaces,
    ideasDrafted,
  };
}

/**
 * Awards every badge the profile has earned and doesn't hold yet, and returns the new ids. Safe to call any time and in
 * parallel: each badge is inserted once (the key is the profile and badge) and only the call that inserts it notifies.
 */
export async function awardBadges(profileId: string, now = new Date()): Promise<string[]> {
  const earned = earnedBadges(await getBadgeSignals(profileId, now));
  if (earned.length === 0) return [];
  const have = new Set((await prisma.badge.findMany({ where: { profileId }, select: { badgeId: true } })).map((b) => b.badgeId));
  const awarded: string[] = [];
  for (const id of earned.filter((e) => !have.has(e))) {
    const { count } = await prisma.badge.createMany({ data: [{ profileId, badgeId: id }], skipDuplicates: true });
    if (count === 0) continue;
    awarded.push(id);
    const label = BADGES.find((b) => b.id === id)?.label ?? id;
    await createNotification(profileId, { kind: "BADGE_EARNED", title: `Badge earned: ${label}`, href: "/activities", dedupeKey: `badge:${id}` });
  }
  return awarded;
}

/** Every badge with its progress and whether it is held. */
export async function listBadges(profileId: string, now = new Date()): Promise<(BadgeProgress & { awardedAt: Date | null })[]> {
  const [signals, rows] = await Promise.all([getBadgeSignals(profileId, now), prisma.badge.findMany({ where: { profileId } })]);
  const at = new Map(rows.map((r) => [r.badgeId, r.awardedAt]));
  return badgeProgress(signals, new Set(at.keys())).map((b) => ({ ...b, awardedAt: at.get(b.id) ?? null }));
}
