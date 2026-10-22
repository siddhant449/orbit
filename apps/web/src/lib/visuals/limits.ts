import { createUsageLimiter, defaultCounterStore, type UsageLimiter } from "@brandloop/ai";
import { prisma } from "@brandloop/db";

export type VisualLimit =
  | { ok: true }
  | { ok: false; status: 429 | 503; code: "daily_limit" | "too_many_active" | "visuals_paused"; message: string };

const MAX_ACTIVE_PER_TEAM = 2;
/** An operation older than this is treated as stuck and no longer counts as active. */
const ACTIVE_WINDOW_MS = 10 * 60_000;

const envInt = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

let limiter: UsageLimiter | null = null;
let now: () => Date = () => new Date();

/** Tests: a limiter on an injected store and clock. */
export function setVisualLimitsForTest(l: UsageLimiter | null, clock?: () => Date): void {
  limiter = l;
  now = clock ?? (() => new Date());
}

/** The kill switch: VISUALS_PAUSED=1 stops every image operation (generate, edit, logo) with a 503. */
export const visualsPaused = (env: Record<string, string | undefined> = process.env) => ["1", "true", "on"].includes(env.VISUALS_PAUSED?.trim().toLowerCase() ?? "");

/**
 * Cost guards for one image operation, run before any debit, enqueue or provider call: the kill switch, at most two
 * active operations per team, then a daily operation count per team (VISUALS_TEAM_DAILY_LIMIT, 40) and across the app
 * (VISUALS_GLOBAL_DAILY_LIMIT, 500). Counters share the chat's Redis helper and reset at UTC midnight.
 */
export async function checkVisualLimits(profile: { id: string; teamId: string }): Promise<VisualLimit> {
  if (visualsPaused()) return { ok: false, status: 503, code: "visuals_paused", message: "Image generation is paused right now. Try again later." };
  const active = await prisma.visual.count({
    where: { teamId: profile.teamId, deletedAt: null, activeOp: { not: null }, activeOpStartedAt: { gt: new Date(now().getTime() - ACTIVE_WINDOW_MS) } },
  });
  if (active >= MAX_ACTIVE_PER_TEAM) {
    return { ok: false, status: 429, code: "too_many_active", message: "Two images are already being made. Wait for one to finish, then try again." };
  }
  const l = (limiter ??= createUsageLimiter({ store: defaultCounterStore() }));
  const team = await l.takeDaily("visuals-team", profile.teamId, envInt("VISUALS_TEAM_DAILY_LIMIT", 40));
  if (!team.ok) return { ok: false, status: 429, code: "daily_limit", message: "You've reached today's image limit. It resets at midnight UTC." };
  const all = await l.takeDaily("visuals-global", "all", envInt("VISUALS_GLOBAL_DAILY_LIMIT", 500));
  if (!all.ok) return { ok: false, status: 503, code: "visuals_paused", message: "Image generation is paused for today. Try again tomorrow." };
  return { ok: true };
}
