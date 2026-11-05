import { DEFAULT_PRESET, GOAL_LIMITS, GOAL_PRESETS, postedByWeek, weekStreak, type GoalPresetId, type GoalValues } from "@brandloop/db/habits";
import type { DayKey } from "./days";

export { DEFAULT_PRESET, GOAL_LIMITS, GOAL_PRESETS, weekStreak };
export type { GoalPresetId, GoalValues };

export const PRESET_LABELS: Record<GoalPresetId, string> = { momentum: "Momentum", growth: "Growth", creator: "Creator" };

/** A stored goal row as the client holds it; `preset` is "custom" when the numbers were typed in. */
export type GoalDto = GoalValues & { preset: GoalPresetId | "custom" };

export const defaultGoal = (): GoalDto => ({ preset: DEFAULT_PRESET, ...GOAL_PRESETS[DEFAULT_PRESET] });

/** This week and the weeks before it as `{posted, goal}`, oldest first, for `weekStreak`. Past weeks use today's goal. */
export function goalWeeks(posted: Record<DayKey, number>, today: DayKey, goal: number, count = 12): { posted: number; goal: number }[] {
  return postedByWeek(posted, today, count).map((n) => ({ posted: n, goal }));
}

/** Whether `today` is the last day (Sunday) of the Monday-first week. */
export const isLastDayOfWeek = (today: DayKey) => new Date(`${today}T00:00:00Z`).getUTCDay() === 0;

/** Checks custom numbers against the limits; returns the first problem or null. */
export function goalProblem(g: GoalValues): string | null {
  for (const k of ["posts", "comments", "dms", "connections"] as const) {
    const v = g[k];
    const { min, max } = GOAL_LIMITS[k];
    if (!Number.isInteger(v) || v < min || v > max) return `${k === "dms" ? "DMs" : k[0]!.toUpperCase() + k.slice(1)} must be a whole number from ${min} to ${max}.`;
  }
  return null;
}
