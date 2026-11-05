import { prisma } from "../client";

export type NotificationInput = { kind: string; title: string; href: string; dedupeKey?: string | null };
export type NotificationRow = { id: string; kind: string; title: string; href: string; createdAt: Date; readAt: Date | null };

/** Stores an event. A second one with the same dedupeKey for the profile is ignored. */
export async function createNotification(profileId: string, input: NotificationInput): Promise<void> {
  await prisma.notification.createMany({
    data: [{ profileId, kind: input.kind, title: input.title, href: input.href, dedupeKey: input.dedupeKey ?? null }],
    skipDuplicates: true,
  });
}

export async function listNotifications(profileId: string, limit = 20): Promise<{ items: NotificationRow[]; unread: number }> {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { profileId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(limit, 100)),
      select: { id: true, kind: true, title: true, href: true, createdAt: true, readAt: true },
    }),
    prisma.notification.count({ where: { profileId, readAt: null } }),
  ]);
  return { items, unread };
}

/** Marks the given events (or all of them) read; ids of another profile are ignored. */
export async function markNotificationsRead(profileId: string, ids: string[] | "all"): Promise<void> {
  if (ids !== "all" && ids.length === 0) return;
  await prisma.notification.updateMany({
    where: { profileId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

/** Deletes events older than `olderThanDays`; returns how many. */
export async function pruneNotifications(olderThanDays = 30, now = new Date()): Promise<number> {
  const { count } = await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - olderThanDays * 86_400_000) } } });
  return count;
}
