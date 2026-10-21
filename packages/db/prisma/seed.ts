import { prisma as defaultPrisma } from "../src/client";
import { PRESET_VOICES } from "./presets";

type Db = Pick<typeof defaultPrisma, "voiceStyle">;

/** Idempotent: upserts the nine preset writing styles by slug. */
export async function seedPresets(db: Db): Promise<void> {
  for (const p of PRESET_VOICES) {
    await db.voiceStyle.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, kind: "PRESET", name: p.name, tagline: p.tagline, guide: p.guide },
      update: { name: p.name, tagline: p.tagline, guide: p.guide },
    });
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
