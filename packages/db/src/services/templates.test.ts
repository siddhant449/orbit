import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  recentTemplateUses,
  recordTemplateUse,
  setTemplateLiked,
  setTemplateSaved,
  TemplateError,
  templateScores,
  updateTemplate,
  upsertSystemTemplates,
  type SeedTemplate,
} from "./templates";
import { account, cleanupVisualTests, secondProfile } from "./visual-test-helpers";

const SLUGS = ["vtest-tpl-a", "vtest-tpl-b", "vtest-tpl-c"];
const row = (slug: string, over: Partial<SeedTemplate> = {}): SeedTemplate => ({
  slug,
  type: "HOOK",
  category: "vtest-story",
  title: `Title ${slug}`,
  skeleton: "I [did X]. Here is what happened.",
  beats: ["setup", "turn"],
  why: "Curiosity gap",
  needs: ["story"],
  tags: ["vtest"],
  ...over,
});
const seed = () =>
  upsertSystemTemplates([
    row("vtest-tpl-a"),
    row("vtest-tpl-b", { type: "POST", category: "vtest-list", title: "Seven lessons" }),
    row("vtest-tpl-c", { type: "POST", category: "vtest-story", title: "Zebra crossing", tags: ["vtest", "zebra"] }),
  ]);
const idOf = async (slug: string) => (await prisma.template.findUniqueOrThrow({ where: { slug } })).id;

async function cleanup() {
  await cleanupVisualTests();
  await prisma.template.deleteMany({ where: { slug: { in: SLUGS } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});


describe("templates", () => {
  it("lists by type, category and search with the right total, and upserts idempotently", async () => {
    expect(await seed()).toBe(3);
    await seed();
    expect(await prisma.template.count({ where: { slug: { in: SLUGS } } })).toBe(3);
    const only = (r: { items: { slug: string }[] }) => r.items.map((i) => i.slug).filter((s) => SLUGS.includes(s)).sort();
    expect(only(await listTemplates({ type: "POST", search: "vtest" }))).toEqual(["vtest-tpl-b", "vtest-tpl-c"]);
    const story = await listTemplates({ category: "vtest-story" });
    expect(story.total).toBe(2);
    expect(only(story)).toEqual(["vtest-tpl-a", "vtest-tpl-c"]);
    const zebra = await listTemplates({ search: "ZEBRA" });
    expect(zebra.total).toBe(1);
    expect(zebra.items[0]!.slug).toBe("vtest-tpl-c");
    const page = await listTemplates({ category: "vtest-story", limit: 1, offset: 1 });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
  });

  it("save and unsave toggle the savedBy filter", async () => {
    await seed();
    const a = await account("t1");
    const id = await idOf("vtest-tpl-a");
    await setTemplateSaved(a.profileId, id, true);
    await setTemplateSaved(a.profileId, id, true);
    expect((await listTemplates({ savedBy: a.profileId })).items.map((i) => i.slug)).toEqual(["vtest-tpl-a"]);
    await setTemplateSaved(a.profileId, id, false);
    expect((await listTemplates({ savedBy: a.profileId })).total).toBe(0);
  });

  it("recentTemplateUses is newest first and templateScores averages 1 - editRatio", async () => {
    await seed();
    const a = await account("t2");
    const [x, y, z] = await Promise.all(["vtest-tpl-a", "vtest-tpl-b", "vtest-tpl-c"].map(idOf));
    await recordTemplateUse({ profileId: a.profileId, templateId: x!, documentId: null, source: "auto" });
    await new Promise((r) => setTimeout(r, 15));
    await recordTemplateUse({ profileId: a.profileId, templateId: y!, documentId: null, source: "picked" });
    expect((await recentTemplateUses(a.profileId, 5)).map((u) => u.templateId)).toEqual([y, x]);
    expect(await recentTemplateUses(a.profileId, 1)).toHaveLength(1);

    await prisma.templateUse.updateMany({ where: { profileId: a.profileId, templateId: x }, data: { editRatio: 0.2 } });
    await prisma.templateUse.create({ data: { profileId: a.profileId, templateId: x!, source: "picked", editRatio: 0.4 } });
    const scores = await templateScores(a.profileId);
    expect(scores.get(x!)).toBeCloseTo(0.7);
    expect(scores.has(y!)).toBe(false);
    expect(scores.get(z!) ?? 0.5).toBe(0.5);
  });
});

describe("own templates", () => {
  const input = { title: "My format", type: "POST" as const, category: "vtest-story", skeleton: "I learned [lesson] from [event]." };
  const fails = async (p: Promise<unknown>, code: string) => {
    const err = await p.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(TemplateError);
    expect((err as TemplateError).code).toBe(code);
  };

  it("an own template needs a [slot]", async () => {
    const a = await account("o1");
    await fails(createTemplate(a.profileId, { ...input, skeleton: "No slot here." }), "invalid");
    await fails(createTemplate(a.profileId, { ...input, skeleton: "[]" }), "invalid");
    await fails(createTemplate(a.profileId, { ...input, title: "t".repeat(81) }), "invalid");
    await fails(createTemplate(a.profileId, { ...input, skeleton: `[x] ${"y".repeat(3000)}` }), "invalid");
    const t = await createTemplate(a.profileId, input);
    expect(t).toMatchObject({ system: false, profileId: a.profileId, likeCount: 0, useCount: 0 });
    expect(t.slug).toMatch(/^own-/);
    await fails(updateTemplate(a.profileId, t.id, { skeleton: "still none" }), "invalid");
    expect((await updateTemplate(a.profileId, t.id, { title: "Renamed" })).title).toBe("Renamed");
    await deleteTemplate(a.profileId, t.id);
    expect(await prisma.template.count({ where: { id: t.id } })).toBe(0);
  });

  it("likes are counted once per profile and unlike decrements", async () => {
    await seed();
    const a = await account("o2");
    const b = await secondProfile(a);
    const id = await idOf("vtest-tpl-a");
    await Promise.all([1, 2, 3].map(() => setTemplateLiked(a.profileId, id, true)));
    expect((await prisma.template.findUniqueOrThrow({ where: { id } })).likeCount).toBe(1);
    await setTemplateLiked(b.profileId, id, true);
    expect((await prisma.template.findUniqueOrThrow({ where: { id } })).likeCount).toBe(2);
    await Promise.all([1, 2].map(() => setTemplateLiked(a.profileId, id, false)));
    expect((await prisma.template.findUniqueOrThrow({ where: { id } })).likeCount).toBe(1);
    const row = (await listTemplates({ ownerProfileId: b.profileId, search: "vtest" })).items.find((i) => i.id === id)!;
    expect(row).toMatchObject({ liked: true, own: false });
    await fails(setTemplateLiked(a.profileId, "nope", true), "not_found");
  });

  it("popular sort ranks recent likes and uses first", async () => {
    await seed();
    const a = await account("o3");
    const [x, y, z] = await Promise.all(["vtest-tpl-a", "vtest-tpl-b", "vtest-tpl-c"].map(idOf));
    // z: old uses only (high all-time); y: one recent like; x: one recent use and one recent like.
    await prisma.template.update({ where: { id: z! }, data: { useCount: 50 } });
    await prisma.templateUse.createMany({ data: Array.from({ length: 5 }, () => ({ profileId: a.profileId, templateId: z!, source: "auto", createdAt: new Date(Date.now() - 90 * 86_400_000) })) });
    await setTemplateLiked(a.profileId, y!, true);
    await setTemplateLiked(a.profileId, x!, true);
    await recordTemplateUse({ profileId: a.profileId, templateId: x!, documentId: null, source: "picked" });
    const popular = await listTemplates({ ownerProfileId: a.profileId, search: "vtest", sort: "popular" });
    expect(popular.items.map((i) => i.slug).filter((s) => SLUGS.includes(s))).toEqual(["vtest-tpl-a", "vtest-tpl-b", "vtest-tpl-c"]);
    expect((await prisma.template.findUniqueOrThrow({ where: { id: x! } })).useCount).toBe(1);
    const page = await listTemplates({ ownerProfileId: a.profileId, search: "vtest", sort: "popular", limit: 1, offset: 1 });
    expect(page.items.map((i) => i.slug)).toEqual(["vtest-tpl-b"]);
    expect(page.total).toBe(3);
    expect((await listTemplates({ ownerProfileId: a.profileId, search: "vtest", sort: "newest" })).items).toHaveLength(3);
  });

  it("another profile cannot edit or see my own template", async () => {
    const a = await account("o4");
    const b = await secondProfile(a);
    const t = await createTemplate(a.profileId, input);
    await fails(updateTemplate(b.profileId, t.id, { title: "Hijack" }), "not_found");
    await fails(deleteTemplate(b.profileId, t.id), "not_found");
    await fails(setTemplateLiked(b.profileId, t.id, true), "not_found");
    expect((await listTemplates({ ownerProfileId: b.profileId, search: "My format" })).total).toBe(0);
    const mine = await listTemplates({ ownerProfileId: a.profileId, search: "My format" });
    expect(mine.items[0]).toMatchObject({ own: true });
    await seed();
    await fails(updateTemplate(a.profileId, await idOf("vtest-tpl-a"), { title: "no" }), "not_found");
  });
});
