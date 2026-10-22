import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { createReference, deleteReference, getReference, listReferences, listTags, ReferenceError } from "./reference-images";
import { account, cleanupVisualTests, object, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

async function make(a: Awaited<ReturnType<typeof account>>, title: string, tags: string[]) {
  const o = await object(a, "REFERENCE");
  return createReference(a.profileId, { title, tags, storageObjectId: o.id, width: 800, height: 600 });
}

describe("reference images", () => {
  it("creates with a trimmed title and normalised, de-duplicated tags", async () => {
    const a = await account("r1");
    const r = await make(a, "  Clean bar chart  ", [" Charts ", "charts", "Minimal"]);
    expect(r).toMatchObject({ title: "Clean bar chart", tags: ["charts", "minimal"], width: 800 });
  });

  it("validates the title (1..80) and tags (1..8, each ≤ 24)", async () => {
    const a = await account("r2");
    const o = await object(a, "REFERENCE");
    const base = { storageObjectId: o.id, width: 1, height: 1 };
    await expect(createReference(a.profileId, { ...base, title: "  ", tags: ["a"] })).rejects.toBeInstanceOf(ReferenceError);
    await expect(createReference(a.profileId, { ...base, title: "x".repeat(81), tags: ["a"] })).rejects.toThrow(/80/);
    await expect(createReference(a.profileId, { ...base, title: "ok", tags: [] })).rejects.toThrow(/tag/i);
    await expect(createReference(a.profileId, { ...base, title: "ok", tags: Array.from({ length: 9 }, (_, i) => `t${i}`) })).rejects.toThrow(/8/);
    await expect(createReference(a.profileId, { ...base, title: "ok", tags: ["x".repeat(25)] })).rejects.toThrow(/24/);
  });

  it("only accepts this profile's private REFERENCE object", async () => {
    const a = await account("r3");
    const p2 = await secondProfile(a);
    const mine = await object(a, "REFERENCE");
    await expect(createReference(p2.profileId, { title: "t", tags: ["a"], storageObjectId: mine.id, width: 1, height: 1 })).rejects.toBeInstanceOf(ReferenceError);
    const pub = await object(a, "VISUAL");
    await expect(createReference(a.profileId, { title: "t", tags: ["a"], storageObjectId: pub.id, width: 1, height: 1 })).rejects.toBeInstanceOf(ReferenceError);
  });

  it("lists newest first, filters by tag and title, and is profile-scoped", async () => {
    const a = await account("r4");
    const p2 = await secondProfile(a);
    const one = await make(a, "Pricing table", ["tables"]);
    await new Promise((r) => setTimeout(r, 15));
    const two = await make(a, "Growth chart", ["charts", "dark"]);
    expect((await listReferences(a.profileId, {})).map((r) => r.id)).toEqual([two.id, one.id]);
    expect((await listReferences(a.profileId, { tag: "charts" })).map((r) => r.id)).toEqual([two.id]);
    expect((await listReferences(a.profileId, { q: "pricing" })).map((r) => r.id)).toEqual([one.id]);
    expect(await listReferences(p2.profileId, {})).toEqual([]);
  });

  it("tags endpoint data: distinct tags for this profile only", async () => {
    const a = await account("r5");
    const b = await account("r6");
    await make(a, "A", ["charts", "dark"]);
    await make(a, "B", ["charts", "minimal"]);
    await make(b, "C", ["secret"]);
    expect(await listTags(a.profileId)).toEqual(["charts", "dark", "minimal"]);
    expect(await listTags(b.profileId)).toEqual(["secret"]);
  });

  it("another profile's reference is not found; delete removes the row and soft-deletes the file", async () => {
    const a = await account("r7");
    const p2 = await secondProfile(a);
    const r = await make(a, "Mine", ["a"]);
    expect(await getReference(p2.profileId, r.id)).toBeNull();
    expect(await deleteReference(p2.profileId, r.id)).toBe(false);
    expect(await deleteReference(a.profileId, r.id)).toBe(true);
    expect(await getReference(a.profileId, r.id)).toBeNull();
    expect(await deleteReference(a.profileId, r.id)).toBe(false);
    const file = await prisma.storageObject.findUnique({ where: { id: r.storageObjectId } });
    expect(file?.deletedAt).toBeInstanceOf(Date);
  });
});
