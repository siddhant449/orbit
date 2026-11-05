import { prisma } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { devDbNameEnabled } from "@/lib/dev-db-name";
import { runDailyCron } from "@/lib/ideas/cron";
import { generateWeeklyIdeas, weeklyIdeasClient } from "@/lib/ideas/weekly";

/**
 * Dev-only (AI_MOCK_MODEL=1, never production), for e2e: runs the daily job without its secret.
 *  - `{reset: true}` first clears the signed-in profile's stored ideas and events, so its week is fresh.
 *  - The profile is marked active, so the run picks it up.
 * Returns the run's counts plus `mine`: the outcome for the signed-in profile (created, exists or failed).
 */
export async function POST(request: Request) {
  if (!devDbNameEnabled()) return new Response("Not found", { status: 404 });
  const { reset } = (await request.json().catch(() => ({}))) as { reset?: boolean };
  const profile = (await getAccount()).currentProfile;
  if (!profile) return Response.json({ error: "No profile." }, { status: 400 });
  if (reset) {
    await prisma.idea.deleteMany({ where: { profileId: profile.id } });
    await prisma.notification.deleteMany({ where: { profileId: profile.id } });
  }
  await prisma.profile.update({ where: { id: profile.id }, data: { lastActiveAt: new Date() } });
  const summary = await runDailyCron();
  const mine = await generateWeeklyIdeas(profile.id, { ai: weeklyIdeasClient, now: () => new Date() });
  return Response.json({ ...summary, mine });
}
