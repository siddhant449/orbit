import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { createNotification, listNotifications, markNotificationsRead, pruneNotifications } from "./notifications";
import { account, cleanupVisualTests, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const ev = (title: string, dedupeKey?: string) => ({ kind: "TEST", title, href: "/x", dedupeKey });

describe("notifications", () => {
  it("a duplicate dedupeKey notification is ignored", async () => {
    const a = await account("n1");
    const b = await secondProfile(a);
    await Promise.all([createNotification(a.profileId, ev("one", "k")), createNotification(a.profileId, ev("one", "k"))]);
    await createNotification(b.profileId, ev("one", "k"));
    await createNotification(a.profileId, ev("no key"));
    await createNotification(a.profileId, ev("no key"));
    const { items, unread } = await listNotifications(a.profileId);
    expect(items.map((i) => i.title).sort()).toEqual(["no key", "no key", "one"]);
    expect(unread).toBe(3);
    expect((await listNotifications(b.profileId)).items).toHaveLength(1);
  });

  it("read marks only the given ids", async () => {
    const a = await account("n2");
    const b = await secondProfile(a);
    for (const t of ["a", "b", "c"]) await createNotification(a.profileId, ev(t, t));
    await createNotification(b.profileId, ev("other", "o"));
    const { items } = await listNotifications(a.profileId);
    const first = items.find((i) => i.title === "a")!;
    await markNotificationsRead(a.profileId, [first.id]);
    expect((await listNotifications(a.profileId)).unread).toBe(2);
    const otherId = (await listNotifications(b.profileId)).items[0]!.id;
    await markNotificationsRead(a.profileId, [otherId]);
    expect((await listNotifications(b.profileId)).unread).toBe(1);
    await markNotificationsRead(a.profileId, "all");
    expect((await listNotifications(a.profileId)).unread).toBe(0);
    expect((await listNotifications(b.profileId)).unread).toBe(1);
  });

  it("prune removes events older than 30 days", async () => {
    const a = await account("n3");
    await createNotification(a.profileId, ev("fresh", "f"));
    await createNotification(a.profileId, ev("old", "o"));
    await prisma.notification.updateMany({ where: { title: "old", profileId: a.profileId }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect(await pruneNotifications(30)).toBeGreaterThanOrEqual(1);
    expect((await listNotifications(a.profileId)).items.map((i) => i.title)).toEqual(["fresh"]);
  });
});
