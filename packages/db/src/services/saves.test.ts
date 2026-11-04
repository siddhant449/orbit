import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { createSpace, deleteSpace, listSaved, listSpaces, reorderSpaceItems, saveItem, SavesError, setItemSpaces, unsaveItem, updateSpace } from "./saves";
import { listTemplates, setTemplateSaved, upsertSystemTemplates } from "./templates";
import { account, cleanupVisualTests, newDocument, secondProfile } from "./visual-test-helpers";

const SLUG = "vtest-save-tpl";
async function cleanup() {
  await cleanupVisualTests();
  await prisma.template.deleteMany({ where: { slug: SLUG } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const seedTemplate = async () => {
  await upsertSystemTemplates([{ slug: SLUG, type: "HOOK", category: "vtest", title: "Save me", skeleton: "I [did X].", beats: [], why: "w", needs: [], tags: [] }]);
  return (await prisma.template.findUniqueOrThrow({ where: { slug: SLUG } })).id;
};
const fails = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(SavesError);
  expect((err as SavesError).code).toBe(code);
};

describe("saves", () => {
  it("a space name must be 1–30 characters", async () => {
    const a = await account("s1");
    await fails(createSpace(a.profileId, { name: "   " }), "invalid");
    await fails(createSpace(a.profileId, { name: "x".repeat(31) }), "invalid");
    await fails(createSpace(a.profileId, { name: "ok", description: "d".repeat(501) }), "invalid");
    const s = await createSpace(a.profileId, { name: "  Hooks I like  " });
    expect(s.name).toBe("Hooks I like");
    await fails(updateSpace(a.profileId, s.id, { name: "" }), "invalid");
    expect((await updateSpace(a.profileId, s.id, { pinned: true })).pinned).toBe(true);
  });

  it("saving the same template twice keeps one item", async () => {
    const a = await account("s2");
    const id = await seedTemplate();
    const rows = await Promise.all([1, 2, 3].map(() => saveItem(a.profileId, { kind: "TEMPLATE", refId: id, snapshot: { title: "Save me" } })));
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    expect(await prisma.savedItem.count({ where: { profileId: a.profileId } })).toBe(1);
    const h = await Promise.all([1, 2].map(() => saveItem(a.profileId, { kind: "HOOK", snapshot: { text: "  A hook  " } })));
    expect(h[0]!.id).toBe(h[1]!.id);
    await fails(saveItem(a.profileId, { kind: "HOOK", snapshot: {} }), "invalid");
    await fails(saveItem(a.profileId, { kind: "POST", snapshot: {} }), "invalid");
  });

  it("deleting a space keeps its items in All saves", async () => {
    const a = await account("s3");
    const sp = await createSpace(a.profileId, { name: "Keep" });
    const item = await saveItem(a.profileId, { kind: "IDEA", snapshot: { text: "idea" }, spaceIds: [sp.id] });
    expect((await listSpaces(a.profileId))[0]!.itemCount).toBe(1);
    await deleteSpace(a.profileId, sp.id);
    const all = await listSaved(a.profileId, { limit: 10 });
    expect(all.items.map((i) => i.id)).toEqual([item.id]);
    expect(all.items[0]!.spaceIds).toEqual([]);
  });

  it("an item can live in two spaces and unsave removes it from both", async () => {
    const a = await account("s4");
    const [s1, s2] = [await createSpace(a.profileId, { name: "One" }), await createSpace(a.profileId, { name: "Two" })];
    const item = await saveItem(a.profileId, { kind: "HOOK", snapshot: { text: "hook" } });
    const moved = await setItemSpaces(a.profileId, item.id, [s1.id, s2.id]);
    expect(moved.spaceIds.sort()).toEqual([s1.id, s2.id].sort());
    expect((await setItemSpaces(a.profileId, item.id, [s2.id])).spaceIds).toEqual([s2.id]);
    await setItemSpaces(a.profileId, item.id, [s1.id, s2.id]);
    await unsaveItem(a.profileId, item.id);
    expect((await listSpaces(a.profileId)).map((s) => s.itemCount)).toEqual([0, 0]);
    expect((await listSaved(a.profileId, { limit: 10 })).items).toHaveLength(0);
    await fails(unsaveItem(a.profileId, item.id), "not_found");
  });

  it("a saved post that is deleted lists as unavailable", async () => {
    const a = await account("s5");
    const doc = await newDocument(a.profileId);
    const item = await saveItem(a.profileId, { kind: "POST", refId: doc.id, snapshot: { title: "A post" } });
    expect(item.available).toBe(true);
    await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    const listed = await listSaved(a.profileId, { limit: 10, kind: "POST" });
    expect(listed.items[0]!.available).toBe(false);
    await prisma.document.delete({ where: { id: doc.id } });
    expect((await listSaved(a.profileId, { limit: 10 })).items[0]!.available).toBe(false);
  });

  it("another profile's space is not found", async () => {
    const a = await account("s6");
    const b = await secondProfile(a);
    const sp = await createSpace(a.profileId, { name: "Mine" });
    const item = await saveItem(a.profileId, { kind: "IDEA", snapshot: { text: "x" } });
    await fails(updateSpace(b.profileId, sp.id, { name: "no" }), "not_found");
    await fails(deleteSpace(b.profileId, sp.id), "not_found");
    await fails(saveItem(b.profileId, { kind: "IDEA", snapshot: { text: "y" }, spaceIds: [sp.id] }), "not_found");
    await fails(setItemSpaces(b.profileId, item.id, []), "not_found");
    await fails(listSaved(b.profileId, { spaceId: sp.id, limit: 5 }), "not_found");
    await fails(unsaveItem(b.profileId, item.id), "not_found");
    expect(await listSpaces(b.profileId)).toEqual([]);
  });

  it("lists by type and space, pages with a cursor, and reorders", async () => {
    const a = await account("s7");
    const sp = await createSpace(a.profileId, { name: "Order" });
    const ids: string[] = [];
    for (const t of ["a", "b", "c"]) ids.push((await saveItem(a.profileId, { kind: t === "c" ? "IDEA" : "HOOK", snapshot: { text: t }, spaceIds: [sp.id] })).id);
    expect((await listSaved(a.profileId, { limit: 10, kind: "IDEA" })).items).toHaveLength(1);
    const p1 = await listSaved(a.profileId, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    const p2 = await listSaved(a.profileId, { limit: 2, cursor: p1.nextCursor! });
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    await reorderSpaceItems(a.profileId, sp.id, [ids[2]!, ids[0]!]);
    const inSpace = await listSaved(a.profileId, { limit: 2, spaceId: sp.id });
    expect(inSpace.items.map((i) => i.id)).toEqual([ids[2], ids[0]]);
    const rest = await listSaved(a.profileId, { limit: 2, spaceId: sp.id, cursor: inSpace.nextCursor! });
    expect(rest.items.map((i) => i.id)).toEqual([ids[1]]);
  });

  it("existing template saves survive the migration", async () => {
    const a = await account("s8");
    const id = await seedTemplate();
    await setTemplateSaved(a.profileId, id, true);
    await setTemplateSaved(a.profileId, id, true);
    const r = await listTemplates({ savedBy: a.profileId });
    expect(r.items.map((i) => i.slug)).toEqual([SLUG]);
    expect(r.items[0]!.saved).toBe(true);
    expect((await listSaved(a.profileId, { limit: 5 })).items[0]).toMatchObject({ kind: "TEMPLATE", refId: id, snapshot: { title: "Save me" } });
    await setTemplateSaved(a.profileId, id, false);
    expect((await listTemplates({ savedBy: a.profileId })).total).toBe(0);
  });
});
