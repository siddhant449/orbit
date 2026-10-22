import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listMemory, upsertMemory } from "./memory";
import { getAiModelPref, setAiModelPref } from "./prefs";
import { assertTestDatabase } from "../test-db";
import { prisma } from "../client";
import { ensureAccount } from "./account";

async function cleanupAll() {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
async function makeProfile() {
  const acc = await ensureAccount({ clerkId: "user_test_prefs1", email: "prefs1@example.test", firstName: "Prefs", teamNameSuffix: " (test)" });
  return { profileId: acc.currentProfile!.id };
}

describe("ai model pref", () => {
  let pid: string;
  beforeEach(async () => {
    await cleanupAll();
    pid = (await makeProfile()).profileId;
  });
  afterAll(cleanupAll);

  it("saves, replaces, clears and stays out of memory", async () => {
    expect(await getAiModelPref(pid)).toBeNull();
    await setAiModelPref(pid, "gpt-6-luna");
    expect(await getAiModelPref(pid)).toBe("gpt-6-luna");
    await setAiModelPref(pid, "gpt-6-sol");
    expect(await getAiModelPref(pid)).toBe("gpt-6-sol");
    await upsertMemory(pid, "identity/about", "- I am a founder", "USER");
    expect((await listMemory(pid)).map((d) => d.key)).toEqual(["identity/about"]);
    await setAiModelPref(pid, null);
    expect(await getAiModelPref(pid)).toBeNull();
  });
});
