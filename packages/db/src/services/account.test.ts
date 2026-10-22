import { assertTestDatabase } from "../test-db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import {
  createProfile,
  ensureAccount,
  getAccountState,
  softDeleteProfile,
  switchProfile,
  updateProfileSettings,
} from "./account";

const clerkUser = { clerkId: "user_test_1", email: "ada@example.test", firstName: "Ada", lastName: "Lovelace" };

beforeEach(async () => {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
});

afterAll(async () => {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.$disconnect();
});

describe("ensureAccount", () => {
  it("creates a user, an owned team and a first profile on first sign-in", async () => {
    const state = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    expect(state.user.email).toBe("ada@example.test");
    expect(state.team.name).toBe("Ada's Team (test)");
    expect(state.role).toBe("OWNER");
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]!.name).toBe("Ada Lovelace");
    expect(state.currentProfile?.id).toBe(state.profiles[0]!.id);
  });

  it("is idempotent", async () => {
    const a = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    const b = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    expect(b.user.id).toBe(a.user.id);
    expect(b.profiles).toHaveLength(1);
  });
});

describe("profiles", () => {
  it("creates a second profile and switches to it", async () => {
    const { user } = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    const p = await createProfile(user.id, { name: "Company page voice" });
    await switchProfile(user.id, p.id);
    const state = await getAccountState(user.id);
    expect(state.profiles.map((x) => x.name)).toEqual(["Ada Lovelace", "Company page voice"]);
    expect(state.currentProfile?.id).toBe(p.id);
  });

  it("refuses to switch to a profile outside the user's team", async () => {
    const { user } = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    const other = await ensureAccount({ clerkId: "user_test_2", email: "b@example.test", firstName: "Bo", teamNameSuffix: " (test)" });
    await expect(switchProfile(user.id, other.profiles[0]!.id)).rejects.toThrow(/not found/i);
  });

  it("soft-deletes a profile and falls back to another current profile", async () => {
    const { user, profiles } = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    const p = await createProfile(user.id, { name: "Side project" });
    await switchProfile(user.id, p.id);
    await softDeleteProfile(user.id, p.id);
    const state = await getAccountState(user.id);
    expect(state.profiles.map((x) => x.id)).toEqual([profiles[0]!.id]);
    expect(state.currentProfile?.id).toBe(profiles[0]!.id);
  });

  it("will not delete the last remaining profile", async () => {
    const { user, profiles } = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    await expect(softDeleteProfile(user.id, profiles[0]!.id)).rejects.toThrow(/last profile/i);
  });

  it("updates language and timezone on the current profile", async () => {
    const { user, profiles } = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    await updateProfileSettings(user.id, profiles[0]!.id, { language: "de-DE", timezone: "Europe/Berlin" });
    const state = await getAccountState(user.id);
    expect(state.currentProfile).toMatchObject({ language: "de-DE", timezone: "Europe/Berlin" });
  });

  it("rejects an unknown timezone", async () => {
    const { user, profiles } = await ensureAccount({ ...clerkUser, teamNameSuffix: " (test)" });
    await expect(updateProfileSettings(user.id, profiles[0]!.id, { timezone: "Mars/Olympus" })).rejects.toThrow(/timezone/i);
  });
});
