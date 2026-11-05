import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { getOrCreateChat, deleteChat } from "./chat";
import {
  ChallengeError,
  endChallenge,
  getActiveChallenge,
  getChallengeDayByChat,
  layoutChallenge,
  listEndingChallenges,
  localDayKey,
  openChallengeDay,
  startChallenge,
} from "./challenge";
import { createDocumentForChat, setDocumentPosted } from "./documents";
import { account, cleanupVisualTests, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const FORMATS = Array.from({ length: 22 }, (_, i) => `f${i + 1}`);
const NOW = new Date("2026-11-04T12:00:00Z"); // a Wednesday
const code = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as ChallengeError | null)?.code;

describe("challenge layout", () => {
  it("22 posting days on weekdays within 30 days for a Wednesday start", () => {
    const days = layoutChallenge("2026-11-04", FORMATS);
    expect(days).toHaveLength(30);
    const posting = days.filter((d) => d.formatId);
    expect(posting).toHaveLength(22);
    expect(posting.map((d) => d.formatId)).toEqual(FORMATS);
    for (const d of days) {
      const wd = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      expect(d.formatId === null).toBe(wd === 0 || wd === 6);
    }
    expect(days[0]).toEqual({ dayNumber: 1, date: "2026-11-04", formatId: "f1" });
    expect(days[29]!.date).toBe("2026-12-03");
    // A Saturday start has 20 weekdays; a Friday start 21.
    expect(layoutChallenge("2026-11-07", FORMATS).filter((d) => d.formatId)).toHaveLength(20);
    expect(layoutChallenge("2026-11-06", FORMATS).filter((d) => d.formatId)).toHaveLength(21);
  });

  it("the local day follows the profile's zone at the edge of midnight", () => {
    const at = new Date("2026-11-04T07:30:00Z");
    expect(localDayKey(at, "Pacific/Pitcairn")).toBe("2026-11-03"); // UTC-8
    expect(localDayKey(at, "UTC")).toBe("2026-11-04");
    expect(localDayKey(at, "Pacific/Auckland")).toBe("2026-11-04"); // UTC+13
    expect(localDayKey(new Date("2026-11-04T11:30:00Z"), "Pacific/Auckland")).toBe("2026-11-05");
    expect(localDayKey(at, "Not/AZone")).toBe("2026-11-04");
  });
});

describe("challenge", () => {
  it("starts with 30 stored days and refuses a second running challenge", async () => {
    const a = await account("c1");
    const c = await startChallenge(a.profileId, "2026-11-04", FORMATS, NOW);
    expect(c.days).toHaveLength(30);
    expect(c.today).toBe("2026-11-04");
    expect(c.completedAt).toBeNull();
    expect(await code(startChallenge(a.profileId, "2026-11-05", FORMATS, NOW))).toBe("conflict");
    expect(await code(startChallenge(a.profileId, "nope", FORMATS, NOW))).toBe("invalid");
    expect(await code(startChallenge(a.profileId, "2030-01-01", FORMATS, NOW))).toBe("invalid");
    expect(await endChallenge(a.profileId, NOW)).toBe(true);
    expect(await getActiveChallenge(a.profileId, NOW)).toBeNull();
    expect(await endChallenge(a.profileId, NOW)).toBe(false);
    // The summary page can still read the ended one.
    expect((await getActiveChallenge(a.profileId, NOW, { includeEnded: true }))?.endedAt).toBeInstanceOf(Date);
    const again = await startChallenge(a.profileId, "2026-11-05", FORMATS, NOW);
    expect(again.id).not.toBe(c.id);
  });

  it("one active enrollment per profile, even with two concurrent starts", async () => {
    const a = await account("c2");
    const results = await Promise.allSettled([1, 2, 3].map(() => startChallenge(a.profileId, "2026-11-04", FORMATS, NOW)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect((r.reason as ChallengeError).code).toBe("conflict");
    expect(await prisma.challengeEnrollment.count({ where: { profileId: a.profileId } })).toBe(1);
  });

  it("another profile cannot open my day or see my challenge", async () => {
    const a = await account("c3");
    const b = await secondProfile(a);
    await startChallenge(a.profileId, "2026-11-04", FORMATS, NOW);
    expect(await getActiveChallenge(b.profileId, NOW)).toBeNull();
    expect(await code(openChallengeDay(b.profileId, b.userId, 1, { now: NOW }))).toBe("not_found");
    expect(await endChallenge(b.profileId, NOW)).toBe(false);
    expect((await getActiveChallenge(a.profileId, NOW))?.endedAt).toBeNull();
    const { chatId } = await openChallengeDay(a.profileId, a.userId, 1, { now: NOW });
    expect(await getChallengeDayByChat(b.profileId, chatId)).toBeNull();
    expect(await getChallengeDayByChat(a.profileId, chatId)).toEqual({ dayNumber: 1, formatId: "f1" });
  });

  it("opening a day returns the same chat, even in parallel; rest, future and missing days are refused", async () => {
    const a = await account("c4");
    await startChallenge(a.profileId, "2026-11-04", FORMATS, NOW);
    const opens = await Promise.all([1, 2, 3].map(() => openChallengeDay(a.profileId, a.userId, 1, { now: NOW, title: "Day 1 · The origin" })));
    expect(new Set(opens.map((o) => o.chatId)).size).toBe(1);
    expect(opens.filter((o) => o.created)).toHaveLength(1);
    expect((await prisma.chat.findFirstOrThrow({ where: { id: opens[0]!.chatId } })).title).toBe("Day 1 · The origin");
    expect(await prisma.chat.count({ where: { profileId: a.profileId, deletedAt: null } })).toBe(1);
    expect(await code(openChallengeDay(a.profileId, a.userId, 4, { now: NOW }))).toBe("invalid"); // Saturday
    expect(await code(openChallengeDay(a.profileId, a.userId, 2, { now: NOW }))).toBe("invalid"); // tomorrow
    expect(await code(openChallengeDay(a.profileId, a.userId, 31, { now: NOW }))).toBe("not_found");
    // A deleted chat is replaced by a new one.
    await deleteChat(a.profileId, opens[0]!.chatId);
    const fresh = await openChallengeDay(a.profileId, a.userId, 1, { now: NOW });
    expect(fresh.created).toBe(true);
    expect(fresh.chatId).not.toBe(opens[0]!.chatId);
  });

  it("a missed day posted later shows its post as posted", async () => {
    const a = await account("c5");
    await startChallenge(a.profileId, "2026-11-02", FORMATS, NOW); // Monday; today is day 3
    const { chatId } = await openChallengeDay(a.profileId, a.userId, 1, { now: NOW });
    const doc = await createDocumentForChat(a.profileId, chatId, { title: "Late post", text: "Body" });
    let day1 = (await getActiveChallenge(a.profileId, NOW))!.days[0]!;
    expect(day1.doc).toMatchObject({ id: doc.id, postedAt: null });
    await setDocumentPosted(a.profileId, doc.id, true);
    day1 = (await getActiveChallenge(a.profileId, NOW))!.days[0]!;
    expect(day1.doc?.postedAt).toBeInstanceOf(Date);
  });

  it("a deleted post (or chat) on a challenge day shows no post, not an error", async () => {
    const a = await account("c6");
    await startChallenge(a.profileId, "2026-11-02", FORMATS, NOW);
    const one = await openChallengeDay(a.profileId, a.userId, 1, { now: NOW });
    const two = await openChallengeDay(a.profileId, a.userId, 2, { now: NOW });
    const d1 = await createDocumentForChat(a.profileId, one.chatId, { title: "One", text: "Body" });
    await createDocumentForChat(a.profileId, two.chatId, { title: "Two", text: "Body" });
    await prisma.document.update({ where: { id: d1.id }, data: { deletedAt: new Date() } });
    await deleteChat(a.profileId, two.chatId);
    const days = (await getActiveChallenge(a.profileId, NOW))!.days;
    expect(days[0]!.doc).toBeNull();
    expect(days[1]!.doc).toBeNull();
  });

  it("completedAt is set once after the 30th day, in the profile's zone, and Start again works", async () => {
    const a = await account("c7");
    await prisma.profile.update({ where: { id: a.profileId }, data: { timezone: "Pacific/Auckland" } }); // UTC+13
    await startChallenge(a.profileId, "2026-10-04", FORMATS, new Date("2026-10-04T12:00:00Z"));
    // Day 30 is 2026-11-02. 2026-11-02T10:00Z is still 11-02 in Auckland? No: +13 gives 11-02 23:00, so not over.
    expect((await getActiveChallenge(a.profileId, new Date("2026-11-02T10:00:00Z")))?.completedAt).toBeNull();
    // 2026-11-02T11:30Z is 11-03 00:30 in Auckland: over.
    const done = await getActiveChallenge(a.profileId, new Date("2026-11-02T11:30:00Z"));
    expect(done?.completedAt).toBeInstanceOf(Date);
    const stamp = done!.completedAt!.getTime();
    expect((await getActiveChallenge(a.profileId, new Date("2026-11-09T11:30:00Z")))!.completedAt!.getTime()).toBe(stamp);
    expect(await code(openChallengeDay(a.profileId, a.userId, 1, { now: new Date("2026-11-03T11:30:00Z") }))).toBe("invalid");
    const again = await startChallenge(a.profileId, "2026-11-03", FORMATS, new Date("2026-11-03T11:30:00Z"));
    expect(again.completedAt).toBeNull();
    expect(await prisma.challengeEnrollment.count({ where: { profileId: a.profileId, endedAt: null } })).toBe(1);
  });

  it("lists a challenge on the reminder day in the profile's own zone, once it is running", async () => {
    const a = await account("c8");
    const b = await secondProfile(a);
    await prisma.profile.update({ where: { id: b.profileId }, data: { timezone: "Pacific/Auckland" } });
    await startChallenge(a.profileId, "2026-11-04", FORMATS, NOW);
    await startChallenge(b.profileId, "2026-11-04", FORMATS, NOW);
    // Day 30 is 2026-12-03, so the reminder day is 2026-11-30.
    const mine = (rows: { profileId: string }[]) => rows.map((r) => r.profileId).filter((id) => id === a.profileId || id === b.profileId).sort();
    expect(mine(await listEndingChallenges(new Date("2026-11-28T12:00:00Z")))).toEqual([]);
    // 2026-11-29T12:00Z is already the 30th in Auckland (UTC+13) but still the 29th in UTC.
    expect(mine(await listEndingChallenges(new Date("2026-11-29T12:00:00Z")))).toEqual([b.profileId]);
    expect(mine(await listEndingChallenges(new Date("2026-11-30T12:00:00Z")))).toEqual([a.profileId]);
    await endChallenge(a.profileId, NOW);
    expect(mine(await listEndingChallenges(new Date("2026-11-30T12:00:00Z")))).toEqual([]);
  });
});
