import { clearTaskDone, createTask, deleteTask, listTaskDones, listTasks, reorderTasks, setTaskDone, TaskError, updateTask } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { addDays, dayKeyIn } from "@/lib/progress/days";
import { dayProgress, tasksForDate, validPause } from "@/lib/progress/tasks";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const NEED_PROFILE = () => fail(400, "Create a profile first.");
type Deps = { now?: () => Date };
type Ctx = { params: Promise<{ id: string }> };

/** How far back done / skipped marks are read for the strip. */
export const TASK_HISTORY_DAYS = 90;

async function ctx(deps: Deps) {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return null;
  return { profile, today: dayKeyIn(deps.now?.() ?? new Date(), profile.timezone || "UTC") };
}

function fromError(err: unknown): Response {
  if (err instanceof TaskError) return fail(err.code === "limit" ? 409 : 400, err.message);
  throw err;
}

const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /api/tasks?date=: all tasks, the recent marks and (with `date`) that day's rows and done / total. */
export async function getTasksHandler(request: Request, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  const date = new URL(request.url).searchParams.get("date");
  if (date !== null && !DayKey.safeParse(date).success) return fail(400, "Send date as YYYY-MM-DD.");
  const [tasks, dones] = await Promise.all([listTasks(c.profile.id), listTaskDones(c.profile.id, addDays(c.today, -TASK_HISTORY_DAYS))]);
  const rows = date ? tasksForDate(tasks, dones, date, c.today) : null;
  return Response.json({ today: c.today, tasks, dones, ...(rows ? { date, items: rows.map((r) => ({ id: r.task.id, carriedOver: r.carriedOver, status: r.status })), ...dayProgress(rows) } : {}) });
}

const Create = z.object({
  title: z.string().max(400),
  note: z.string().max(2000).nullable().optional(),
  repeat: z.enum(["once", "weekdays", "weekly"]),
  weekday: z.number().int().nullable().optional(),
});

/** POST /api/tasks `{title, note?, repeat, weekday?}` -> 201 `{task}`. */
export async function postTaskHandler(request: Request, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  const body = Create.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send a title and how often it repeats.");
  try {
    return Response.json({ task: await createTask(c.profile.id, body.data) }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

const Patch = Create.partial().extend({ pausedUntil: DayKey.nullable().optional() });

/** PATCH /api/tasks/:id: edit fields, or `{pausedUntil}` to pause (at most 28 days from today) or `null` to resume. */
export async function patchTaskHandler(request: Request, { params }: Ctx, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  const body = Patch.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send the fields to change.");
  if (body.data.pausedUntil && !validPause(c.today, body.data.pausedUntil)) return fail(400, "A task can be paused for up to 28 days.");
  try {
    const task = await updateTask(c.profile.id, (await params).id, body.data);
    return task ? Response.json({ task }) : fail(404, "Activity not found.");
  } catch (err) {
    return fromError(err);
  }
}

/** DELETE /api/tasks/:id. */
export async function deleteTaskHandler(_request: Request, { params }: Ctx, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  return (await deleteTask(c.profile.id, (await params).id)) ? Response.json({ ok: true }) : fail(404, "Activity not found.");
}

const Done = z.object({ date: DayKey, status: z.enum(["DONE", "SKIPPED"]) });

/** POST /api/tasks/:id/done `{date, status}`: done or skipped for a day up to today (and 90 days back). */
export async function postDoneHandler(request: Request, { params }: Ctx, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  const body = Done.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send { date: YYYY-MM-DD, status: DONE | SKIPPED }.");
  if (body.data.date > c.today || body.data.date < addDays(c.today, -TASK_HISTORY_DAYS)) return fail(400, "Choose a day from the last 90 days up to today.");
  try {
    const done = await setTaskDone(c.profile.id, (await params).id, body.data.date, body.data.status);
    return done ? Response.json({ done }) : fail(404, "Activity not found.");
  } catch (err) {
    return fromError(err);
  }
}

/** DELETE /api/tasks/:id/done?date=: undo a done or skipped mark. */
export async function deleteDoneHandler(request: Request, { params }: Ctx, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  const date = DayKey.safeParse(new URL(request.url).searchParams.get("date"));
  if (!date.success) return fail(400, "Send ?date=YYYY-MM-DD.");
  try {
    return (await clearTaskDone(c.profile.id, (await params).id, date.data)) ? Response.json({ ok: true }) : fail(404, "Activity not found.");
  } catch (err) {
    return fromError(err);
  }
}

const Order = z.object({ ids: z.array(z.string().min(1).max(40)).max(100) });

/** PUT /api/tasks/order `{ids}`: the new order. Ids that aren't this profile's are ignored. */
export async function putOrderHandler(request: Request, deps: Deps = {}): Promise<Response> {
  const c = await ctx(deps);
  if (!c) return NEED_PROFILE();
  const body = Order.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send { ids: [...] }.");
  await reorderTasks(c.profile.id, body.data.ids);
  return Response.json({ tasks: await listTasks(c.profile.id) });
}
