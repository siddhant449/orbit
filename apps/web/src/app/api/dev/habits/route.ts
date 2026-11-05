import { prisma } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { devDbNameEnabled } from "@/lib/dev-db-name";

/**
 * Dev-only (AI_MOCK_MODEL=1, never production), for e2e: `{reset: true}` clears the signed-in profile's challenge, goals,
 * counts, to-dos, badges and "posted" marks, plus their badge and challenge events, so a run starts from nothing.
 */
export async function POST(request: Request) {
  if (!devDbNameEnabled()) return new Response("Not found", { status: 404 });
  const { reset } = (await request.json().catch(() => ({}))) as { reset?: boolean };
  const profile = (await getAccount()).currentProfile;
  if (!profile) return Response.json({ error: "No profile." }, { status: 400 });
  if (reset) {
    const profileId = profile.id;
    await prisma.$transaction([
      prisma.challengeEnrollment.deleteMany({ where: { profileId } }),
      prisma.weeklyGoal.deleteMany({ where: { profileId } }),
      prisma.goalTally.deleteMany({ where: { profileId } }),
      prisma.task.deleteMany({ where: { profileId } }),
      prisma.badge.deleteMany({ where: { profileId } }),
      prisma.notification.deleteMany({ where: { profileId, kind: { in: ["BADGE_EARNED", "CHALLENGE_ENDING"] } } }),
      prisma.$executeRaw`UPDATE "Document" SET "postedAt" = NULL WHERE "profileId" = ${profileId} AND "postedAt" IS NOT NULL`,
    ]);
  }
  return Response.json({ ok: true });
}
