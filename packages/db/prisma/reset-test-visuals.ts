// Resets the e2e user's image state in the isolated test database: its visuals, credit account and ledger, brand theme and
// reference images, so every e2e run starts with a full 30 credits. Refuses to run against a non-_test database.
//   E2E_EMAIL=… pnpm --filter @brandloop/db exec tsx prisma/reset-test-visuals.ts
import "../src/use-test-db";
import { prisma } from "../src/client";
import { assertTestDatabase } from "../src/test-db";

try {
  await assertTestDatabase(prisma);
  const email = process.env.E2E_EMAIL?.trim();
  if (!email) throw new Error("E2E_EMAIL is required");
  const users = await prisma.user.findMany({ where: { email }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const teams = await prisma.membership.findMany({ where: { userId: { in: userIds } }, select: { teamId: true } });
  const teamIds = teams.map((t) => t.teamId);
  const profiles = await prisma.profile.findMany({ where: { teamId: { in: teamIds } }, select: { id: true } });
  const profileIds = profiles.map((p) => p.id);
  await prisma.visual.deleteMany({ where: { teamId: { in: teamIds } } });
  await prisma.creditLedger.deleteMany({ where: { teamId: { in: teamIds } } });
  await prisma.creditAccount.deleteMany({ where: { teamId: { in: teamIds } } });
  await prisma.brandTheme.deleteMany({ where: { profileId: { in: profileIds } } });
  const refs = (prisma as unknown as { referenceImage?: { deleteMany(a: unknown): Promise<unknown> } }).referenceImage;
  await refs?.deleteMany({ where: { profileId: { in: profileIds } } });
  console.log("Reset image credits, visuals, brand theme and references for the e2e user");
} catch (err) {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
