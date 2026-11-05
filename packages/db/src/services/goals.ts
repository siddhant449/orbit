import { prisma } from "../client";
import { DEFAULT_PRESET, GOAL_LIMITS, GOAL_PRESETS, type GoalPresetId, type GoalValues } from "../habits";

export type GoalRow = GoalValues & { preset: GoalPresetId | "custom" };
export type TallyKind = "comments" | "dms" | "connections";
export const TALLY_KINDS: readonly TallyKind[] = ["comments", "dms", "connections"];

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalError";
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** The profile's weekly goal; the Growth preset until one is saved. */
export async function getWeeklyGoal(profileId: string): Promise<GoalRow> {
  const row = await prisma.weeklyGoal.findUnique({ where: { profileId } });
  if (!row) return { preset: DEFAULT_PRESET, ...GOAL_PRESETS[DEFAULT_PRESET] };
  return { preset: row.preset as GoalRow["preset"], posts: row.posts, comments: row.comments, dms: row.dms, connections: row.connections };
}

/** Saves a preset (its numbers) or custom numbers. Each number must be a whole number inside its limits. */
export async function setWeeklyGoal(profileId: string, input: { preset: GoalPresetId } | { custom: GoalValues }): Promise<GoalRow> {
  const goal: GoalRow = "preset" in input ? { preset: input.preset, ...GOAL_PRESETS[input.preset] } : { preset: "custom", ...input.custom };
  if ("preset" in input && !(input.preset in GOAL_PRESETS)) throw new GoalError("Choose Momentum, Growth, Creator or custom numbers.");
  for (const k of ["posts", "comments", "dms", "connections"] as const) {
    const { min, max } = GOAL_LIMITS[k];
    if (!Number.isInteger(goal[k]) || goal[k] < min || goal[k] > max) throw new GoalError(`${k} must be a whole number from ${min} to ${max}.`);
  }
  const data = { preset: goal.preset, posts: goal.posts, comments: goal.comments, dms: goal.dms, connections: goal.connections };
  await prisma.weeklyGoal.upsert({ where: { profileId }, create: { profileId, ...data }, update: data });
  return goal;
}

/** What the writer counted by hand in a week. */
export async function getTallies(profileId: string, weekStartOn: string): Promise<Record<TallyKind, number>> {
  const rows = await prisma.goalTally.findMany({ where: { profileId, weekStartOn: day(weekStartOn) } });
  const out: Record<TallyKind, number> = { comments: 0, dms: 0, connections: 0 };
  for (const r of rows) if (r.kind in out) out[r.kind as TallyKind] = r.count;
  return out;
}

/**
 * Adds `delta` (+1 or -1) to a week's tally in one statement, never below zero. Parallel +1s each count, because the
 * increment happens in the database, not in a read-then-write.
 */
export async function adjustTally(profileId: string, weekStartOn: string, kind: TallyKind, delta: 1 | -1): Promise<number> {
  if (!TALLY_KINDS.includes(kind) || (delta !== 1 && delta !== -1)) throw new GoalError("Count comments, DMs or connections by one.");
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "GoalTally" ("profileId", "weekStartOn", "kind", "count")
    VALUES (${profileId}, ${day(weekStartOn)}::date, ${kind}, GREATEST(0, ${delta}))
    ON CONFLICT ("profileId", "weekStartOn", "kind") DO UPDATE SET "count" = GREATEST(0, "GoalTally"."count" + ${delta})
    RETURNING "count"`;
  return rows[0]?.count ?? 0;
}
