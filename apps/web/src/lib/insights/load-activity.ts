import { prisma } from "@brandloop/db";
import { localActivity, RANGES, writingStreak, type LocalActivity, type Range, type Streak } from "./local-activity";

/** A year back is enough for the longest streak and the 90-day range with its previous window. */
const HISTORY_DAYS = 365;

export type ActivitySummary = { byRange: Record<Range, LocalActivity>; streak: Streak };

/**
 * Reads all of the profile's documents (deleted ones included) and their saved versions and derives the Analytics screen's
 * local numbers for every range at once, so the range switch is instant. Server only.
 */
export async function loadActivitySummary(profileId: string, timeZone: string, now = new Date()): Promise<ActivitySummary> {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);
  // Deleted drafts still count: the writing happened on that day, so streaks and totals don't drop when a draft is removed.
  const where = { profileId };
  const [documents, versions] = await Promise.all([
    prisma.document.findMany({ where: { ...where, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.documentVersion.findMany({
      where: { document: where, createdAt: { gte: since } },
      select: { createdAt: true, source: true },
    }),
  ]);
  const input = { now, timeZone, documents, versions };
  const byRange = Object.fromEntries(RANGES.map((r) => [r, localActivity(r, input)])) as Record<Range, LocalActivity>;
  return { byRange, streak: writingStreak(versions.map((v) => v.createdAt), now, timeZone) };
}
