import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (the isolated test database, TEST_DATABASE_URL); only Clerk is faked.
const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; timezone: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { createDocumentForChat, ensureAccount, getOrCreateChat, listNotifications, prisma } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { getGoalsHandler, postTallyHandler, putGoalsHandler } from "./goals-api";
import { postedHandler } from "./documents-api";
import { deleteDoneHandler, getTasksHandler, patchTaskHandler, postDoneHandler, postTaskHandler, putOrderHandler } from "./tasks-api";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLERK = "user_test_webhabits";
const NOW = new Date("2026-11-04T12:00:00Z"); // Wednesday
const deps = { now: () => NOW };
let mine: { userId: string; profileId: string };
let theirs: { userId: string; profileId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: " (test)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}
async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `${CLERK}${n}`, email: `webhabits${n}@example.test`, firstName: "Habits", teamNameSuffix: " (test)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}
const as = (a: { userId: string; profileId: string }) => {
  env.account = { user: { id: a.userId }, currentProfile: { id: a.profileId, timezone: "UTC" } };
};
const json = (method: string, body: unknown) => new Request("http://test/x", { method, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await wipe();
  mine = await account(1);
  theirs = await account(2);
});
afterAll(wipe);
beforeEach(async () => {
  const ids = [mine.profileId, theirs.profileId];
  await prisma.task.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.goalTally.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.weeklyGoal.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.badge.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { profileId: { in: ids } } });
  as(mine);
});

describe("goals routes", () => {
  it("defaults to Growth, takes a preset or custom numbers and rejects bad ones", async () => {
    expect(await (await getGoalsHandler(deps)).json()).toMatchObject({ goal: { preset: "growth", posts: 5 }, tally: { comments: 0 }, weekStartOn: "2026-11-02" });
    expect(await (await putGoalsHandler(json("PUT", { preset: "momentum" }))).json()).toMatchObject({ goal: { preset: "momentum", posts: 3, comments: 25 } });
    expect((await putGoalsHandler(json("PUT", { preset: "huge" }))).status).toBe(400);
    expect((await putGoalsHandler(json("PUT", { custom: { posts: 0, comments: 1, dms: 1, connections: 1 } }))).status).toBe(400);
    expect(await (await putGoalsHandler(json("PUT", { custom: { posts: 4, comments: 10, dms: 2, connections: 7 } }))).json()).toMatchObject({ goal: { preset: "custom", posts: 4 } });
  });

  it("tally: +1 twice and -1 once is 1, never below 0, parallel +1s both count, per profile", async () => {
    const tally = (kind: string, delta: number) => postTallyHandler(json("POST", { kind, delta }), deps);
    await tally("comments", 1);
    await tally("comments", 1);
    expect(await (await tally("comments", -1)).json()).toMatchObject({ count: 1 });
    expect(await (await tally("dms", -1)).json()).toMatchObject({ count: 0 });
    await Promise.all([tally("connections", 1), tally("connections", 1), tally("connections", 1)]);
    expect(await (await getGoalsHandler(deps)).json()).toMatchObject({ tally: { comments: 1, dms: 0, connections: 3 } });
    expect((await tally("posts", 1)).status).toBe(400);
    expect((await tally("comments", 2)).status).toBe(400);
    as(theirs);
    expect(await (await getGoalsHandler(deps)).json()).toMatchObject({ tally: { comments: 0, dms: 0, connections: 0 } });
  });
});

describe("tasks routes", () => {
  // Tasks are made "now" in real time; the clock under test is 2026-11-04, so they are dated to it.
  const make = async (body: object = { title: "Comment on 5 posts", repeat: "weekdays" }) => {
    const task = ((await (await postTaskHandler(json("POST", body), deps)).json()) as { task: { id: string } }).task;
    await prisma.task.update({ where: { id: task.id }, data: { createdAt: new Date("2026-11-04T09:00:00Z") } });
    return task;
  };

  it("creates, ticks, skips, undoes, reorders and reads a day's rows", async () => {
    const a = await make();
    const b = await make({ title: "Review stats", repeat: "once" });
    await postDoneHandler(json("POST", { date: "2026-11-04", status: "DONE" }), params(a.id), deps);
    await postDoneHandler(json("POST", { date: "2026-11-04", status: "SKIPPED" }), params(b.id), deps);
    const day = (await (await getTasksHandler(new Request("http://t/api/tasks?date=2026-11-04"), deps)).json()) as { done: number; total: number; items: { id: string; status: string }[] };
    expect(day).toMatchObject({ done: 1, total: 1 });
    expect(day.items.map((i) => i.status)).toEqual(["done", "skipped"]);
    expect((await deleteDoneHandler(new Request("http://t/x?date=2026-11-04", { method: "DELETE" }), params(b.id), deps)).status).toBe(200);
    expect((await postDoneHandler(json("POST", { date: "2026-11-05", status: "DONE" }), params(a.id), deps)).status).toBe(400); // tomorrow
    const order = (await (await putOrderHandler(json("PUT", { ids: [b.id, a.id] }), deps)).json()) as { tasks: { id: string }[] };
    expect(order.tasks.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("a missed one-off carries to today, a pause over 28 days is rejected, and another profile's task is not found", async () => {
    const once = await make({ title: "Yesterday's", repeat: "once" });
    await prisma.task.update({ where: { id: once.id }, data: { createdAt: new Date("2026-11-03T09:00:00Z") } });
    const day = (await (await getTasksHandler(new Request("http://t/api/tasks?date=2026-11-04"), deps)).json()) as { items: { id: string; carriedOver: boolean }[] };
    expect(day.items).toEqual([{ id: once.id, carriedOver: true, status: "open" }]);

    const rep = await make();
    expect((await patchTaskHandler(json("PATCH", { pausedUntil: "2026-12-02" }), params(rep.id), deps)).status).toBe(200);
    expect((await patchTaskHandler(json("PATCH", { pausedUntil: "2026-12-03" }), params(rep.id), deps)).status).toBe(400);
    expect((await patchTaskHandler(json("PATCH", { pausedUntil: "2026-11-04" }), params(rep.id), deps)).status).toBe(400);
    expect((await patchTaskHandler(json("PATCH", { pausedUntil: null }), params(rep.id), deps)).status).toBe(200);

    as(theirs);
    expect((await patchTaskHandler(json("PATCH", { title: "x" }), params(rep.id), deps)).status).toBe(404);
    expect((await postDoneHandler(json("POST", { date: "2026-11-04", status: "DONE" }), params(rep.id), deps)).status).toBe(404);
    expect(await (await getTasksHandler(new Request("http://t/api/tasks"), deps)).json()).toMatchObject({ tasks: [], dones: [] });
  });
});

describe("mark as posted awards the first badge", () => {
  it("First post is earned and announced once, even when the post is marked twice", async () => {
    const chat = randomUUID();
    await getOrCreateChat(mine.profileId, mine.userId, chat);
    const doc = await createDocumentForChat(mine.profileId, chat, { title: "Post", text: "Body" });
    const req = new Request("http://test/x", { method: "POST" });
    await Promise.all([postedHandler(req, params(doc.id), true), postedHandler(req, params(doc.id), true)]);
    await postedHandler(req, params(doc.id), true);
    const { items } = await listNotifications(mine.profileId);
    expect(items.filter((i) => i.kind === "BADGE_EARNED").map((i) => i.title)).toEqual(["Badge earned: First post"]);
    expect(await prisma.badge.count({ where: { profileId: mine.profileId } })).toBe(1);
  });
});
