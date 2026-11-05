import type { AiClient } from "@brandloop/ai";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma, pruneNotifications } from "@brandloop/db";
import { dueForGeneration, weekStartOn } from "./week";
import { generateWeeklyIdeas, weeklyIdeasClient } from "./weekly";

/** At most this many profiles are served per run; the rest wait for the next day's run. */
export const CRON_MAX_PROFILES = 50;
/** A profile nobody used for this long costs nothing. */
export const CRON_ACTIVE_DAYS = 14;
const CANDIDATE_SCAN = 1000;

/**
 * Profiles that should get this week's ideas now: used in the last 14 days, past their generation day in their own
 * time zone, and with no weekly batch for their local week yet. Most recently active first, at most `limit`.
 */
export async function selectDueProfiles(now: Date, limit = CRON_MAX_PROFILES): Promise<string[]> {
  const since = new Date(now.getTime() - CRON_ACTIVE_DAYS * 86_400_000);
  const candidates = await prisma.profile.findMany({
    where: { deletedAt: null, lastActiveAt: { gte: since } },
    orderBy: { lastActiveAt: "desc" },
    take: CANDIDATE_SCAN,
    select: { id: true, timezone: true, generationDayOfWeek: true },
  });
  const due = candidates
    .filter((p) => dueForGeneration(now, p.timezone, p.generationDayOfWeek))
    .map((p) => ({ id: p.id, week: weekStartOn(now, p.timezone) }));
  if (due.length === 0) return [];
  const have = await prisma.idea.findMany({
    where: { origin: "weekly", position: 0, profileId: { in: due.map((d) => d.id) }, weekStartOn: { in: [...new Set(due.map((d) => new Date(`${d.week}T00:00:00Z`)))] } },
    select: { profileId: true, weekStartOn: true },
  });
  const done = new Set(have.map((h) => `${h.profileId}|${h.weekStartOn.toISOString().slice(0, 10)}`));
  return due.filter((d) => !done.has(`${d.id}|${d.week}`)).slice(0, limit).map((d) => d.id);
}

/** Work other features add to the daily run (challenge reminders). Each gets the run's clock; a failure is logged, never fatal. */
export const dailyCronHooks: Array<(ctx: { now: Date }) => Promise<void>> = [];

export type CronSummary = { generated: number; skipped: number; failed: number };

/** The daily run: weekly ideas for due profiles (one at a time), old events pruned, then the other features' hooks. */
export async function runDailyCron(deps: { now?: () => Date; ai?: AiClient; limit?: number } = {}): Promise<CronSummary> {
  const now = deps.now?.() ?? new Date();
  const summary: CronSummary = { generated: 0, skipped: 0, failed: 0 };
  for (const id of await selectDueProfiles(now, deps.limit ?? CRON_MAX_PROFILES)) {
    const out = await generateWeeklyIdeas(id, { ai: deps.ai ?? weeklyIdeasClient, now: () => now });
    if (out === "created") summary.generated++;
    else if (out === "exists") summary.skipped++;
    else summary.failed++;
  }
  await pruneNotifications(30, now).catch((err) => console.error(`[cron] prune failed: ${err instanceof Error ? err.message : String(err)}`));
  for (const hook of dailyCronHooks) await hook({ now }).catch((err) => console.error(`[cron] hook failed: ${err instanceof Error ? err.message : String(err)}`));
  return summary;
}

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. A missing or wrong header is 401. With no CRON_SECRET set the
 * run is refused: 503 in production (a deployment mistake worth seeing), 401 elsewhere.
 */
export function checkCronAuth(request: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return env.NODE_ENV === "production"
      ? Response.json({ error: "The daily job isn't configured." }, { status: 503 })
      : Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const given = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  return null;
}

export async function getCronHandler(request: Request, deps: { now?: () => Date; ai?: AiClient; env?: Record<string, string | undefined> } = {}): Promise<Response> {
  const denied = checkCronAuth(request, deps.env);
  if (denied) return denied;
  return Response.json(await runDailyCron(deps));
}
