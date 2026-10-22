import { prisma as defaultPrisma } from "../src/client";
import type { Prisma } from "../src/generated/prisma/client";
import { PRESET_PROFILE_VERSION, PRESET_VOICES } from "./presets";

type Db = Pick<typeof defaultPrisma, "voiceStyle">;

/**
 * Idempotent: creates the nine preset writing styles by slug, and rewrites one only when its stored profile version is
 * lower than PRESET_PROFILE_VERSION (so an edit made in the database is not overwritten by every deploy).
 */
export async function seedPresets(db: Db): Promise<void> {
  for (const p of PRESET_VOICES) {
    const data = {
      name: p.name,
      tagline: p.tagline,
      guide: p.guide,
      styleProfile: p.profile as unknown as Prisma.InputJsonValue,
      profileVersion: PRESET_PROFILE_VERSION,
      status: "READY" as const,
      analyzedPostCount: p.profile.source.postCount,
      analyzedAt: new Date(p.profile.source.compiledAt),
      corpusHash: p.profile.source.corpusHash,
    };
    const existing = await db.voiceStyle.findUnique({ where: { slug: p.slug }, select: { profileVersion: true } });
    if (!existing) await db.voiceStyle.create({ data: { slug: p.slug, kind: "PRESET", ...data } });
    else if (existing.profileVersion < PRESET_PROFILE_VERSION) await db.voiceStyle.update({ where: { slug: p.slug }, data });
  }
}

async function main() {
  await seedPresets(defaultPrisma);
  console.log(`Seeded ${PRESET_VOICES.length} preset writing styles`);
}

// Only run when executed directly (tsx prisma/seed.ts), not when imported by tests.
if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => defaultPrisma.$disconnect());
}
