// Seeds the isolated test database (TEST_DATABASE_URL) with the rows the app expects to exist before any user signs
// in: the preset writing styles. Idempotent. Used by the e2e global setup; refuses to run against a non-_test database.
//   pnpm --filter @brandloop/db exec tsx prisma/seed-test.ts
import "../src/use-test-db";
import { prisma } from "../src/client";
import { assertTestDatabase } from "../src/test-db";
import { PRESET_VOICES } from "./presets";
import { seedPresets } from "./seed";

try {
  await assertTestDatabase(prisma);
  await seedPresets(prisma);
  console.log(`Seeded ${PRESET_VOICES.length} preset writing styles into the test database`);
} catch (err) {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
