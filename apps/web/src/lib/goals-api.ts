import { adjustTally, getTallies, getWeeklyGoal, GoalError, setWeeklyGoal } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { weekStartOn } from "@/lib/ideas/week";
import { GOAL_PRESETS } from "@/lib/progress/goals";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const NEED_PROFILE = () => fail(400, "Create a profile first.");
type Deps = { now?: () => Date };

async function profile() {
  return (await getAccount())?.currentProfile ?? null;
}

/** GET /api/goals: the weekly goal (Growth until one is saved), this week's hand counts and the week's start. */
export async function getGoalsHandler(deps: Deps = {}): Promise<Response> {
  const p = await profile();
  if (!p) return NEED_PROFILE();
  const week = weekStartOn(deps.now?.() ?? new Date(), p.timezone || "UTC");
  const [goal, tally] = await Promise.all([getWeeklyGoal(p.id), getTallies(p.id, week)]);
  return Response.json({ goal, tally, weekStartOn: week });
}

const Num = z.number().int();
const PutBody = z.union([
  z.object({ preset: z.enum(Object.keys(GOAL_PRESETS) as [keyof typeof GOAL_PRESETS, ...(keyof typeof GOAL_PRESETS)[]]) }),
  z.object({ custom: z.object({ posts: Num, comments: Num, dms: Num, connections: Num }) }),
]);

/** PUT /api/goals `{preset}` or `{custom: {posts, comments, dms, connections}}`. */
export async function putGoalsHandler(request: Request): Promise<Response> {
  const p = await profile();
  if (!p) return NEED_PROFILE();
  const body = PutBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send a preset (momentum, growth or creator) or custom whole numbers.");
  try {
    return Response.json({ goal: await setWeeklyGoal(p.id, body.data) });
  } catch (err) {
    if (err instanceof GoalError) return fail(400, err.message);
    throw err;
  }
}

const TallyBody = z.object({ kind: z.enum(["comments", "dms", "connections"]), delta: z.union([z.literal(1), z.literal(-1)]) });

/** POST /api/goals/tally `{kind, delta}`: +1 or -1 on this week's hand count, never below 0. Returns the new count. */
export async function postTallyHandler(request: Request, deps: Deps = {}): Promise<Response> {
  const p = await profile();
  if (!p) return NEED_PROFILE();
  const body = TallyBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send { kind: comments | dms | connections, delta: 1 | -1 }.");
  const week = weekStartOn(deps.now?.() ?? new Date(), p.timezone || "UTC");
  const count = await adjustTally(p.id, week, body.data.kind, body.data.delta);
  return Response.json({ kind: body.data.kind, count, weekStartOn: week });
}
