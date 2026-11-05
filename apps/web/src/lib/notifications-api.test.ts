import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; timezone: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { createNotification, ensureAccount, prisma, saveIdeaBatch, startChallenge } from "@brandloop/db";
import { getNotificationsHandler, postNotificationsReadHandler } from "./notifications-api";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLERK = "user_webtest_bell";
let a: { userId: string; profileId: string };
let b: { userId: string; profileId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  for (let attempt = 1; ; attempt++) {
    try {
      await assertTestDatabase(prisma);
      await prisma.team.deleteMany({ where: { name: { endsWith: " (webtest)" }, memberships: { some: { user: users } } } });
      await prisma.user.deleteMany({ where: users });
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}
const as = (p: { userId: string; profileId: string }) => (env.account = { user: { id: p.userId }, currentProfile: { id: p.profileId, timezone: "UTC" } });
const NOW = new Date("2026-11-04T10:00:00Z");
const get = async () => (await getNotificationsHandler({ now: () => NOW })).json() as Promise<{ derived: { id: string }[]; items: { id: string; title: string; read: boolean }[]; unread: number }>;
const read = (body: unknown) => postNotificationsReadHandler(new Request("http://t/api/notifications/read", { method: "POST", body: JSON.stringify(body) }));

beforeAll(async () => {
  await wipe();
  const one = await ensureAccount({ clerkId: `${CLERK}1`, email: "webbell1@example.test", firstName: "A", teamNameSuffix: " (webtest)" });
  const two = await ensureAccount({ clerkId: `${CLERK}2`, email: "webbell2@example.test", firstName: "B", teamNameSuffix: " (webtest)" });
  a = { userId: one.user.id, profileId: one.currentProfile!.id };
  b = { userId: two.user.id, profileId: two.currentProfile!.id };
});
afterAll(wipe);

describe("notifications API", () => {
  it("GET returns unread count; read all clears it", async () => {
    as(a);
    await createNotification(a.profileId, { kind: "IDEAS_READY", title: "This week's ideas are ready", href: "/ideas", dedupeKey: "ideas:2026-11-02" });
    await createNotification(a.profileId, { kind: "IMAGE_READY", title: "Your image is ready", href: "/images", dedupeKey: "visual:1" });
    await createNotification(b.profileId, { kind: "IMAGE_READY", title: "Not yours", href: "/images", dedupeKey: "visual:2" });
    const before = await get();
    expect(before.unread).toBe(2);
    expect(before.items.map((i) => i.title).sort()).toEqual(["This week's ideas are ready", "Your image is ready"]);
    // Reading one id marks only that one; another profile's id changes nothing.
    const bId = (await prisma.notification.findFirstOrThrow({ where: { profileId: b.profileId } })).id;
    expect((await read({ ids: [before.items[0]!.id, bId] })).status).toBe(200);
    expect((await get()).unread).toBe(1);
    expect(await prisma.notification.count({ where: { profileId: b.profileId, readAt: null } })).toBe(1);
    expect((await read({ all: true })).status).toBe(200);
    const after = await get();
    expect(after.unread).toBe(0);
    expect(after.items.every((i) => i.read)).toBe(true);
    expect((await read({ nope: 1 })).status).toBe(400);
  });

  it("derived rows count only this week's untouched ideas", async () => {
    as(b);
    expect((await get()).derived.find((r) => r.id === "ideas")).toBeUndefined();
    const { ideas } = await saveIdeaBatch(b.profileId, "2026-11-02", "weekly", [1, 2, 3].map((n) => ({ category: "c", title: `t${n}`, detail: "d", prompt: "p", sourceKind: "pillar" })));
    await prisma.idea.update({ where: { id: ideas[0]!.id }, data: { hidden: true } });
    await prisma.idea.update({ where: { id: ideas[1]!.id }, data: { drafted: true } });
    const rows = (await (await getNotificationsHandler({ now: () => NOW })).json()) as { derived: { id: string; title: string }[] };
    expect(rows.derived.find((r) => r.id === "ideas")!.title).toBe("1 idea is waiting for you");
  });

  it("adds today's challenge day as a derived row, only for the profile that has one", async () => {
    await startChallenge(a.profileId, "2026-11-02", Array.from({ length: 22 }, (_, i) => `f${i}`), NOW);
    as(a);
    const mine = (await (await getNotificationsHandler({ now: () => NOW })).json()) as { derived: { id: string; title: string; detail?: string }[] };
    expect(mine.derived.find((r) => r.id === "challenge")).toMatchObject({ title: "Challenge day 3", detail: "0 of 22 posted" });
    as(b);
    const other = (await (await getNotificationsHandler({ now: () => NOW })).json()) as { derived: { id: string }[] };
    expect(other.derived.some((r) => r.id === "challenge")).toBe(false);
  });
});
