import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { StyleProfileSchema, type StyleProfile } from "@brandloop/ai";
import { measureCorpus, measurePost } from "@brandloop/ai/measure";
import { prisma } from "../client";
import { assertTestDatabase } from "../test-db";
import { PRESET_PROFILE_VERSION, PRESET_VOICES } from "../../prisma/presets";
import { seedPresets } from "../../prisma/seed";
import { ensureAccount } from "./account";
import { getStyleProfile, listStyleVersions, renderProfileGuide, restoreStyleVersion, saveStyleProfile } from "./style-profile";

// Names that must appear in no preset field: Kleo's nine preset labels (recon) and a few well-known creators. Test-only.
const REAL_CREATOR_DENYLIST = ["justin welsh", "jasmin alic", "george blackman", "lara acosta", "dan koe", "alex hormozi", "gary vaynerchuk", "sahil bloom", "kleo"];

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
  const acc = await ensureAccount({ clerkId: `user_test_style${n}`, email: `style${n}@example.test`, firstName: "Style", teamNameSuffix: " (test)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}

const preset = PRESET_VOICES[0]!;
const ownProfile = (tag: string): StyleProfile => ({
  ...structuredClone(preset.profile),
  voiceTarget: `Write plainly (${tag}).`,
  source: { kind: "own", postCount: 4, corpusHash: tag, compiledAt: "2026-10-22T00:00:00.000Z", model: "test" },
});
async function ownStyle(profileId: string) {
  return prisma.voiceStyle.create({ data: { profileId, kind: "OWN", name: "Mine", status: "PENDING" } });
}

describe("preset profiles", () => {
  it("every preset's layout matches its own reference posts", () => {
    for (const p of PRESET_VOICES) {
      const m = measureCorpus(p.profile.referencePosts.map((r) => r.text));
      const l = p.profile.layout;
      for (const k of ["hookChars", "postChars", "blocks", "proseBlockChars"] as const) {
        expect(m[k].typical, `${p.slug} ${k}`).toBeGreaterThanOrEqual(l[k].low);
        expect(m[k].typical, `${p.slug} ${k}`).toBeLessThanOrEqual(l[k].high);
      }
      expect(l.listPosts).toEqual(m.listPosts);
      expect(StyleProfileSchema.safeParse(p.profile).success, p.slug).toBe(true);
      expect(p.profile.referencePosts.length).toBeGreaterThanOrEqual(4);
      for (const r of p.profile.referencePosts) expect(r.text.length, p.slug).toBeLessThanOrEqual(1300);
    }
  });

  it("presets span the layout range", () => {
    const typical = PRESET_VOICES.map((p) => p.profile.layout.postChars.typical);
    expect(Math.min(...typical)).toBeLessThan(400);
    expect(Math.max(...typical)).toBeGreaterThan(1000);
    expect(PRESET_VOICES.some((p) => p.profile.layout.listPosts.numbered >= 50)).toBe(true);
    expect(PRESET_VOICES.some((p) => p.profile.layout.listPosts.bullet >= 50)).toBe(true);
    expect(PRESET_VOICES.some((p) => p.profile.layout.listPosts.bullet + p.profile.layout.listPosts.numbered === 0)).toBe(true);
  });

  it("no preset names a real person or uses a real creator's text", () => {
    for (const p of PRESET_VOICES) {
      const all = JSON.stringify(p).toLowerCase();
      for (const name of REAL_CREATOR_DENYLIST) expect(all, `${p.slug} mentions ${name}`).not.toContain(name);
    }
  });

  it("reference posts honour the common rules: no emoji, dashes, hashtags or links", () => {
    for (const p of PRESET_VOICES) {
      for (const r of p.profile.referencePosts) {
        const m = measurePost(r.text);
        expect([m.emoji.count, m.dashes, m.hashtags, m.links], `${p.slug}: ${r.text.slice(0, 30)}`).toEqual([0, 0, 0, 0]);
      }
    }
  });

  it("guides keep the four classic sections", () => {
    for (const p of PRESET_VOICES) for (const h of ["## Rhythm", "## Structure", "## Signature moves", "## Avoid"]) expect(p.guide).toContain(h);
  });

  it("seeding stores profiles, is idempotent and skips presets already at the current version", async () => {
    await seedPresets(prisma);
    const row = await prisma.voiceStyle.findUniqueOrThrow({ where: { slug: preset.slug } });
    expect(row.profileVersion).toBe(PRESET_PROFILE_VERSION);
    expect(StyleProfileSchema.safeParse(row.styleProfile).success).toBe(true);
    await prisma.voiceStyle.update({ where: { slug: preset.slug }, data: { tagline: "edited" } });
    await seedPresets(prisma);
    expect((await prisma.voiceStyle.findUniqueOrThrow({ where: { slug: preset.slug } })).tagline).toBe("edited");
    await prisma.voiceStyle.update({ where: { slug: preset.slug }, data: { profileVersion: 1 } });
    await seedPresets(prisma);
    expect((await prisma.voiceStyle.findUniqueOrThrow({ where: { slug: preset.slug } })).tagline).toBe(preset.tagline);
    expect(await prisma.voiceStyle.count({ where: { kind: "PRESET" } })).toBe(9);
  });
});

describe("style profile storage", () => {
  it("saving bumps the version, keeps history, prunes to 10 and rewrites the guide", async () => {
    const { profileId } = await account(1);
    const style = await ownStyle(profileId);
    for (let i = 1; i <= 12; i++) expect(await saveStyleProfile(style.id, ownProfile(`v${i}`), `h${i}`)).toEqual({ version: i });
    const versions = await listStyleVersions(profileId, style.id);
    expect(versions!.map((v) => v.version)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    const row = await prisma.voiceStyle.findUniqueOrThrow({ where: { id: style.id } });
    expect(row).toMatchObject({ profileVersion: 12, status: "READY", corpusHash: "h12", analyzedPostCount: 4 });
    expect(row.guide).toContain("v12");
    expect(row.guide).toContain("## Signature moves");
  });

  it("restores an earlier version as a new version", async () => {
    const { profileId } = await account(2);
    const style = await ownStyle(profileId);
    await saveStyleProfile(style.id, ownProfile("first"), "h1");
    await saveStyleProfile(style.id, ownProfile("second"), "h2");
    expect(await restoreStyleVersion(profileId, style.id, 1)).toEqual({ version: 3 });
    const got = await getStyleProfile(profileId, style.id);
    expect(got!.profile!.voiceTarget).toContain("first");
    expect(got!.style.profileVersion).toBe(3);
  });

  it("cannot restore a preset's version or another profile's", async () => {
    const a = await account(3);
    const b = await account(4);
    const style = await ownStyle(a.profileId);
    await saveStyleProfile(style.id, ownProfile("x"), "h");
    await expect(restoreStyleVersion(b.profileId, style.id, 1)).rejects.toThrow(/not found/i);
    await seedPresets(prisma);
    const presetRow = await prisma.voiceStyle.findUniqueOrThrow({ where: { slug: preset.slug } });
    await expect(restoreStyleVersion(a.profileId, presetRow.id, 1)).rejects.toThrow(/not found/i);
  });

  it("another profile's own style is not found, a preset is", async () => {
    const a = await account(5);
    const b = await account(6);
    const style = await ownStyle(a.profileId);
    expect(await getStyleProfile(b.profileId, style.id)).toBeNull();
    expect(await listStyleVersions(b.profileId, style.id)).toBeNull();
    await seedPresets(prisma);
    const presetRow = await prisma.voiceStyle.findUniqueOrThrow({ where: { slug: preset.slug } });
    const got = await getStyleProfile(b.profileId, presetRow.id);
    expect(got!.profile!.source.kind).toBe("preset");
  });

  it("a row without a profile still gives its guide", async () => {
    const { profileId } = await account(7);
    const legacy = await prisma.voiceStyle.create({ data: { profileId, kind: "OWN", name: "Old", guide: "## Rhythm\n- short" } });
    const got = await getStyleProfile(profileId, legacy.id);
    expect(got!.profile).toBeNull();
    expect(got!.style.guide).toContain("Rhythm");
  });

  it("rejects a profile that fails the schema", async () => {
    const { profileId } = await account(8);
    const style = await ownStyle(profileId);
    const bad = { ...ownProfile("bad"), layout: {} } as unknown as StyleProfile;
    await expect(saveStyleProfile(style.id, bad, "h")).rejects.toThrow();
  });

  it("the schema rejects layout supplied by a model without numbers", () => {
    expect(StyleProfileSchema.safeParse({ ...preset.profile, layout: {} }).success).toBe(false);
  });

  it("renders a guide from a profile", () => {
    expect(renderProfileGuide(preset.profile)).toContain(preset.profile.voiceTarget);
  });
});
