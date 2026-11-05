import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { touchProfileActive } from "./account";
import { getIdea, listIdeaWeeks, markIdeaDrafted, saveIdeaBatch, setIdeaHidden, type IdeaInput } from "./ideas";
import { account, cleanupVisualTests, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const batch = (n: number, tag = "a"): IdeaInput[] =>
  Array.from({ length: n }, (_, i) => ({ category: "Story", title: `${tag} ${i}`, detail: "d", prompt: "p", sourceKind: "pillar", sourceRef: "x" }));
const WEEK = "2026-11-02";

describe("ideas", () => {
  it("saving the same week's batch twice creates once", async () => {
    const a = await account("i1");
    const results = await Promise.all([1, 2, 3].map((n) => saveIdeaBatch(a.profileId, WEEK, "weekly", batch(5, `r${n}`))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    for (const r of results) expect(r.ideas).toHaveLength(5);
    expect(await prisma.idea.count({ where: { profileId: a.profileId } })).toBe(5);
    expect(results[0]!.ideas[0]!.weekStartOn).toBe(WEEK);
  });

  it("chat ideas append, even concurrently, and stay apart from the weekly batch", async () => {
    const a = await account("i2");
    await saveIdeaBatch(a.profileId, WEEK, "weekly", batch(5));
    const runs = await Promise.all([1, 2, 3].map((n) => saveIdeaBatch(a.profileId, WEEK, "chat", batch(2, `c${n}`))));
    expect(runs.every((r) => r.created && r.ideas.length >= 2)).toBe(true);
    const chat = await prisma.idea.findMany({ where: { profileId: a.profileId, origin: "chat" }, orderBy: { position: "asc" } });
    expect(chat.map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(await prisma.idea.count({ where: { profileId: a.profileId, origin: "weekly" } })).toBe(5);
  });

  it("lists the newest weeks first and keeps profiles apart", async () => {
    const a = await account("i3");
    const b = await secondProfile(a);
    await saveIdeaBatch(a.profileId, "2026-10-26", "weekly", batch(2, "old"));
    await saveIdeaBatch(a.profileId, WEEK, "weekly", batch(2, "new"));
    await saveIdeaBatch(b.profileId, WEEK, "weekly", batch(2, "other"));
    const weeks = await listIdeaWeeks(a.profileId, { weeks: 8 });
    expect(weeks.map((w) => w.weekStartOn)).toEqual([WEEK, "2026-10-26"]);
    expect(weeks[0]!.ideas.map((i) => i.title)).toEqual(["new 0", "new 1"]);
    expect(await listIdeaWeeks(a.profileId, { weeks: 1 })).toHaveLength(1);
  });

  it("hide and draft only touch the owner's idea, and the first chat wins", async () => {
    const a = await account("i4");
    const b = await secondProfile(a);
    const { ideas } = await saveIdeaBatch(a.profileId, WEEK, "weekly", batch(1));
    const id = ideas[0]!.id;
    expect(await setIdeaHidden(b.profileId, id, true)).toBe(false);
    expect((await getIdea(a.profileId, id))!.hidden).toBe(false);
    expect(await setIdeaHidden(a.profileId, id, true)).toBe(true);
    const wins = await Promise.all(["c1", "c2"].map((c) => markIdeaDrafted(a.profileId, id, c)));
    expect(wins.filter(Boolean)).toHaveLength(1);
    const row = (await getIdea(a.profileId, id))!;
    expect(row.drafted).toBe(true);
    expect(["c1", "c2"]).toContain(row.chatId);
  });

  it("lastActiveAt is written at most once an hour", async () => {
    const a = await account("i5");
    const now = new Date("2026-11-04T10:00:00Z");
    expect(await touchProfileActive(a.profileId, null, now)).toBe(true);
    const row = await prisma.profile.findUniqueOrThrow({ where: { id: a.profileId } });
    expect(await touchProfileActive(a.profileId, row.lastActiveAt, new Date(now.getTime() + 30 * 60_000))).toBe(false);
    expect(await touchProfileActive(a.profileId, null, new Date(now.getTime() + 30 * 60_000))).toBe(false);
    expect(await touchProfileActive(a.profileId, row.lastActiveAt, new Date(now.getTime() + 61 * 60_000))).toBe(true);
  });
});
