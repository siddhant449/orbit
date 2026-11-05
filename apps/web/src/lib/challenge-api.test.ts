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

import { ensureAccount, listNotifications, prisma } from "@brandloop/db";
import { challengeEndingHook } from "./challenge-cron";
import { deleteChallengeHandler, getChallengeHandler, openDayHandler, postChallengeHandler } from "./challenge-api";

const CLERK = "user_test_webchallenge";
const NOW = new Date("2026-11-04T12:00:00Z");
let mine: { userId: string; profileId: string };
let theirs: { userId: string; profileId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: " (test)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}
async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `${CLERK}${n}`, email: `webchallenge${n}@example.test`, firstName: "Challenge", teamNameSuffix: " (test)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}
const as = (a: { userId: string; profileId: string }) => {
  env.account = { user: { id: a.userId }, currentProfile: { id: a.profileId, timezone: "UTC" } };
};
const post = (body: unknown) => new Request("http://test/api/challenge", { method: "POST", body: JSON.stringify(body) });
const deps = { now: () => NOW };

beforeAll(async () => {
  await wipe();
  mine = await account(1);
  theirs = await account(2);
});
afterAll(wipe);
beforeEach(async () => {
  await prisma.challengeEnrollment.deleteMany({ where: { profileId: { in: [mine.profileId, theirs.profileId] } } });
  await prisma.notification.deleteMany({ where: { profileId: { in: [mine.profileId, theirs.profileId] } } });
  as(mine);
});

describe("challenge routes", () => {
  it("starts today by default with 22 posting days, and two parallel starts make one", async () => {
    const [a, b] = await Promise.all([postChallengeHandler(post({}), deps), postChallengeHandler(post({}), deps)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const { challenge } = (await (await getChallengeHandler(deps)).json()) as { challenge: { startDate: string; today: string; days: { formatId: string | null }[] } };
    expect(challenge.startDate).toBe("2026-11-04");
    expect(challenge.days.filter((d) => d.formatId)).toHaveLength(22);
    expect((await postChallengeHandler(post({ startDate: "soon" }), deps)).status).toBe(400);
  });

  it("opens a day to one chat, refuses other profiles, and ending is idempotent-safe", async () => {
    await postChallengeHandler(post({}), deps);
    const [x, y] = await Promise.all([openDayHandler("1", deps), openDayHandler("1", deps)]);
    expect(((await x.json()) as { chatId: string }).chatId).toBe(((await y.json()) as { chatId: string }).chatId);
    expect((await openDayHandler("2", deps)).status).toBe(400); // tomorrow
    expect((await openDayHandler("99", deps)).status).toBe(404);

    as(theirs);
    expect((await openDayHandler("1", deps)).status).toBe(404);
    expect(((await (await getChallengeHandler(deps)).json()) as { challenge: unknown }).challenge).toBeNull();
    expect((await deleteChallengeHandler(deps)).status).toBe(404);

    as(mine);
    expect((await deleteChallengeHandler(deps)).status).toBe(200);
    expect((await deleteChallengeHandler(deps)).status).toBe(404);
  });
});

describe("challenge reminder", () => {
  it("notifies once, three days before the last day, even if the daily run repeats", async () => {
    await postChallengeHandler(post({}), deps);
    await challengeEndingHook({ now: new Date("2026-11-29T12:00:00Z") });
    expect((await listNotifications(mine.profileId)).items).toHaveLength(0);
    await challengeEndingHook({ now: new Date("2026-11-30T12:00:00Z") });
    await challengeEndingHook({ now: new Date("2026-11-30T18:00:00Z") });
    const { items } = await listNotifications(mine.profileId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "CHALLENGE_ENDING", title: "Your challenge ends in 3 days", href: "/challenge" });
    expect((await listNotifications(theirs.profileId)).items).toHaveLength(0);
  });
});
