import { assertTestDatabase } from "../test-db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { getObject, listGcCandidates, recordObject, softDeleteObject } from "./storage-objects";

async function cleanup() {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `user_test_so${n}`, email: `so${n}@example.test`, firstName: "S", teamNameSuffix: " (test)" });
  return { profileId: acc.currentProfile!.id, teamId: acc.team.id };
}
const input = (a: { profileId: string; teamId: string }, key: string) => ({
  ...a, key, store: "PUBLIC" as const, kind: "VISUAL" as const, contentType: "image/png", bytes: 12, sha256: "ab".repeat(32), width: 10, height: 10,
  url: `https://blob.example/${key}`,
});

describe("storage objects", () => {
  it("records an object and reads it back by profile", async () => {
    const a = await account(1);
    const o = await recordObject(input(a, "p/x/visual/one.png"));
    expect(o).toMatchObject({ key: "p/x/visual/one.png", store: "PUBLIC", kind: "VISUAL", width: 10 });
    expect((await getObject(a.profileId, o.id))?.url).toBe("https://blob.example/p/x/visual/one.png");
  });

  it("hides another profile's object", async () => {
    const a = await account(2);
    const b = await account(3);
    const o = await recordObject(input(a, "p/x/visual/two.png"));
    expect(await getObject(b.profileId, o.id)).toBeNull();
    expect(await softDeleteObject(b.profileId, o.id)).toBeNull();
    expect(await getObject(a.profileId, o.id)).not.toBeNull();
  });

  it("soft delete hides the object, is idempotent, and surfaces it to the gc after the grace period", async () => {
    const a = await account(4);
    const o = await recordObject(input(a, "p/x/visual/three.png"));
    expect((await softDeleteObject(a.profileId, o.id))?.deletedAt).toBeInstanceOf(Date);
    expect(await getObject(a.profileId, o.id)).toBeNull();
    expect(await softDeleteObject(a.profileId, o.id)).toBeNull();
    expect((await listGcCandidates(new Date(Date.now() - 60_000))).map((x) => x.id)).not.toContain(o.id);
    expect((await listGcCandidates(new Date(Date.now() + 60_000))).map((x) => x.id)).toContain(o.id);
  });

  it("keys are unique", async () => {
    const a = await account(5);
    await recordObject(input(a, "p/x/visual/dup.png"));
    await expect(recordObject(input(a, "p/x/visual/dup.png"))).rejects.toThrow();
  });
});
