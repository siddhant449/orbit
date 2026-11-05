import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { awardBadges, getBadgeSignals, listBadges } from "./badges";
import { createDocumentForChat, setDocumentPosted } from "./documents";
import { adjustTally, getTallies, getWeeklyGoal, GoalError, setWeeklyGoal } from "./goals";
import { getOrCreateChat } from "./chat";
import { listNotifications } from "./notifications";
import { createSpace } from "./saves";
import { clearTaskDone, createTask, deleteTask, listTaskDones, listTasks, reorderTasks, setTaskDone, TaskError, updateTask } from "./tasks";
import { randomUUID } from "node:crypto";
import { account, cleanupVisualTests, secondProfile, type TestAccount } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const WEEK = "2026-11-02";

async function postedPost(a: TestAccount, title = "P") {
  const chat = randomUUID();
  await getOrCreateChat(a.profileId, a.userId, chat);
  const doc = await createDocumentForChat(a.profileId, chat, { title, text: "Body" });
  await setDocumentPosted(a.profileId, doc.id, true);
  return doc;
}

describe("weekly goal and tallies", () => {
  it("defaults to Growth, saves a preset or custom numbers, and rejects bad ones", async () => {
    const a = await account("g1");
    expect(await getWeeklyGoal(a.profileId)).toEqual({ preset: "growth", posts: 5, comments: 50, dms: 10, connections: 50 });
    expect(await setWeeklyGoal(a.profileId, { preset: "momentum" })).toEqual({ preset: "momentum", posts: 3, comments: 25, dms: 5, connections: 10 });
    expect((await getWeeklyGoal(a.profileId)).preset).toBe("momentum");
    expect(await setWeeklyGoal(a.profileId, { custom: { posts: 4, comments: 0, dms: 2, connections: 7 } })).toMatchObject({ preset: "custom", posts: 4 });
    await expect(setWeeklyGoal(a.profileId, { custom: { posts: 0, comments: 1, dms: 1, connections: 1 } })).rejects.toBeInstanceOf(GoalError);
    await expect(setWeeklyGoal(a.profileId, { custom: { posts: 3, comments: 1.5, dms: 1, connections: 1 } })).rejects.toBeInstanceOf(GoalError);
    expect((await getWeeklyGoal(a.profileId)).posts).toBe(4);
  });

  it("tally never goes below zero and double +1 counts twice", async () => {
    const a = await account("g2");
    const b = await secondProfile(a);
    expect(await adjustTally(a.profileId, WEEK, "comments", -1)).toBe(0);
    await Promise.all([adjustTally(a.profileId, WEEK, "comments", 1), adjustTally(a.profileId, WEEK, "comments", 1), adjustTally(a.profileId, WEEK, "dms", 1)]);
    expect(await getTallies(a.profileId, WEEK)).toEqual({ comments: 2, dms: 1, connections: 0 });
    expect(await adjustTally(a.profileId, WEEK, "comments", -1)).toBe(1);
    await adjustTally(a.profileId, WEEK, "dms", -1);
    await adjustTally(a.profileId, WEEK, "dms", -1);
    expect((await getTallies(a.profileId, WEEK)).dms).toBe(0);
    // Another week and another profile are separate.
    expect(await getTallies(a.profileId, "2026-11-09")).toEqual({ comments: 0, dms: 0, connections: 0 });
    expect(await getTallies(b.profileId, WEEK)).toEqual({ comments: 0, dms: 0, connections: 0 });
    await expect(adjustTally(a.profileId, WEEK, "posts" as never, 1)).rejects.toBeInstanceOf(GoalError);
  });
});

describe("tasks", () => {
  it("creates, lists in order, edits, reorders and deletes", async () => {
    const a = await account("t1");
    const one = await createTask(a.profileId, { title: "  Comment on 5 posts ", repeat: "weekdays" });
    const two = await createTask(a.profileId, { title: "Review stats", note: "Friday", repeat: "weekly", weekday: 5 });
    expect(one.title).toBe("Comment on 5 posts");
    expect(two).toMatchObject({ repeat: "weekly", weekday: 5, note: "Friday", position: 1 });
    expect((await listTasks(a.profileId)).map((t) => t.id)).toEqual([one.id, two.id]);
    await reorderTasks(a.profileId, [two.id, one.id]);
    expect((await listTasks(a.profileId)).map((t) => t.id)).toEqual([two.id, one.id]);
    expect(await updateTask(a.profileId, one.id, { title: "Comment on 8 posts", pausedUntil: "2026-11-20" })).toMatchObject({ title: "Comment on 8 posts", pausedUntil: "2026-11-20" });
    expect((await updateTask(a.profileId, one.id, { pausedUntil: null }))?.pausedUntil).toBeNull();
    await expect(createTask(a.profileId, { title: "", repeat: "once" })).rejects.toBeInstanceOf(TaskError);
    await expect(createTask(a.profileId, { title: "x", repeat: "weekly" })).rejects.toBeInstanceOf(TaskError);
    expect(await deleteTask(a.profileId, two.id)).toBe(true);
    expect(await deleteTask(a.profileId, two.id)).toBe(false);
  });

  it("another profile's task is not found", async () => {
    const a = await account("t2");
    const b = await secondProfile(a);
    const mine = await createTask(a.profileId, { title: "Mine", repeat: "once" });
    expect(await updateTask(b.profileId, mine.id, { title: "Hacked" })).toBeNull();
    expect(await deleteTask(b.profileId, mine.id)).toBe(false);
    expect(await setTaskDone(b.profileId, mine.id, WEEK, "DONE")).toBeNull();
    expect(await clearTaskDone(b.profileId, mine.id, WEEK)).toBe(false);
    await reorderTasks(b.profileId, [mine.id]);
    expect(await listTasks(b.profileId)).toEqual([]);
    expect((await listTasks(a.profileId))[0]).toMatchObject({ title: "Mine", position: 0 });
    await setTaskDone(a.profileId, mine.id, WEEK, "DONE");
    expect(await listTaskDones(b.profileId, "2020-01-01")).toEqual([]);
    expect(await listTaskDones(a.profileId, "2020-01-01")).toEqual([{ taskId: mine.id, date: WEEK, status: "DONE" }]);
  });

  it("done and skipped are per day, the last call wins, and undo clears the mark", async () => {
    const a = await account("t3");
    const t = await createTask(a.profileId, { title: "Daily", repeat: "weekdays" });
    await Promise.all([setTaskDone(a.profileId, t.id, WEEK, "DONE"), setTaskDone(a.profileId, t.id, WEEK, "DONE")]);
    await setTaskDone(a.profileId, t.id, "2026-11-03", "SKIPPED");
    expect((await listTaskDones(a.profileId, WEEK)).map((d) => `${d.date}:${d.status}`)).toEqual([`${WEEK}:DONE`, "2026-11-03:SKIPPED"]);
    await setTaskDone(a.profileId, t.id, WEEK, "SKIPPED");
    expect((await listTaskDones(a.profileId, WEEK))[0]!.status).toBe("SKIPPED");
    expect(await clearTaskDone(a.profileId, t.id, WEEK)).toBe(true);
    expect(await listTaskDones(a.profileId, WEEK)).toHaveLength(1);
    await expect(setTaskDone(a.profileId, t.id, "nope", "DONE")).rejects.toBeInstanceOf(TaskError);
  });
});

describe("badges", () => {
  it("awardBadges awards once and notifies once", async () => {
    const a = await account("b1");
    expect(await awardBadges(a.profileId)).toEqual([]);
    await postedPost(a);
    const runs = await Promise.all([awardBadges(a.profileId), awardBadges(a.profileId), awardBadges(a.profileId)]);
    expect(runs.flat()).toEqual(["first-post"]);
    expect(await awardBadges(a.profileId)).toEqual([]);
    const notes = (await listNotifications(a.profileId)).items.filter((i) => i.kind === "BADGE_EARNED");
    expect(notes.map((n) => n.title)).toEqual(["Badge earned: First post"]);
    expect(await prisma.badge.count({ where: { profileId: a.profileId } })).toBe(1);
    const list = await listBadges(a.profileId);
    expect(list.find((b) => b.id === "first-post")).toMatchObject({ earned: true });
    expect(list.find((b) => b.id === "posts-5")).toMatchObject({ earned: false, current: 1, target: 5, awardedAt: null });
  });

  it("an earned badge stays held when the post is later un-marked", async () => {
    const a = await account("b2");
    const doc = await postedPost(a);
    await awardBadges(a.profileId);
    await setDocumentPosted(a.profileId, doc.id, false);
    expect(await awardBadges(a.profileId)).toEqual([]);
    expect((await listBadges(a.profileId)).find((b) => b.id === "first-post")?.earned).toBe(true);
  });

  it("awards from spaces and own templates, and counts only this profile's data", async () => {
    const a = await account("b3");
    const b = await secondProfile(a);
    await createSpace(a.profileId, { name: "Hooks" });
    await prisma.template.create({ data: { profileId: a.profileId, system: false, slug: `own-${randomUUID()}`, type: "HOOK", category: "x", title: "Mine", skeleton: "I [did X].", beats: [], why: "w", needs: [], tags: [] } });
    expect(await awardBadges(a.profileId)).toEqual(["first-template", "first-space"]);
    expect(await awardBadges(b.profileId)).toEqual([]);
    expect(await getBadgeSignals(b.profileId)).toMatchObject({ posted: 0, spaces: 0, ownTemplates: 0 });
  });

  it("a week streak and a full week come from posts in the profile's weeks", async () => {
    const a = await account("b4");
    await setWeeklyGoal(a.profileId, { preset: "momentum" }); // 3 posts a week
    const now = new Date("2026-11-04T12:00:00Z");
    // Three posts in each of the last three full weeks and this week, one per distinct day.
    const days = ["2026-11-03", "2026-11-04", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-13", "2026-10-14", "2026-10-15"];
    for (const d of days) {
      const doc = await postedPost(a, d);
      await prisma.$executeRaw`UPDATE "Document" SET "postedAt" = ${new Date(`${d}T10:00:00Z`)} WHERE "id" = ${doc.id}`;
    }
    // This week has 2 (3 Nov, 4 Nov), last three weeks have 3 each: streak is 3 (this week not yet met).
    expect((await getBadgeSignals(a.profileId, now)).weekStreak).toBe(3);
    const doc = await postedPost(a, "extra");
    await prisma.$executeRaw`UPDATE "Document" SET "postedAt" = ${new Date("2026-11-02T10:00:00Z")} WHERE "id" = ${doc.id}`;
    const s = await getBadgeSignals(a.profileId, now);
    expect(s.weekStreak).toBe(4);
    expect(s.fullWeek).toBe(false);
    expect(await awardBadges(a.profileId, now)).toContain("streak-4");
  });
});
