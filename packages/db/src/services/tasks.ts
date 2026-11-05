import { prisma } from "../client";
import { localDayKey } from "./challenge";

/** The writer's to-dos. Every read and write is scoped to the profile; another profile's task is not found. */

export type TaskRepeat = "once" | "weekdays" | "weekly";
export const TASK_LIMIT = 50;
export const TASK_TITLE_MAX = 120;
export const TASK_NOTE_MAX = 500;

export class TaskError extends Error {
  readonly code: "invalid" | "limit";
  constructor(code: "invalid" | "limit", message: string) {
    super(message);
    this.name = "TaskError";
    this.code = code;
  }
}

export type TaskRow = {
  id: string;
  title: string;
  note: string | null;
  repeat: TaskRepeat;
  weekday: number | null;
  position: number;
  pausedUntil: string | null;
  createdOn: string;
};
export type TaskDoneRow = { taskId: string; date: string; status: "DONE" | "SKIPPED" };
export type TaskInput = { title: string; note?: string | null; repeat: TaskRepeat; weekday?: number | null };

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const key = (d: Date) => d.toISOString().slice(0, 10);
const validKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && key(day(v)) === v;

function clean(input: Partial<TaskInput>, partial: boolean) {
  const out: { title?: string; note?: string | null; repeat?: TaskRepeat; weekday?: number | null } = {};
  if (input.title !== undefined || !partial) {
    const title = (input.title ?? "").trim();
    if (title.length < 1 || title.length > TASK_TITLE_MAX) throw new TaskError("invalid", `A title must be 1 to ${TASK_TITLE_MAX} characters.`);
    out.title = title;
  }
  if (input.note !== undefined) {
    const note = input.note?.trim() || null;
    if (note && note.length > TASK_NOTE_MAX) throw new TaskError("invalid", `A note can be up to ${TASK_NOTE_MAX} characters.`);
    out.note = note;
  }
  if (input.repeat !== undefined || !partial) {
    if (!["once", "weekdays", "weekly"].includes(input.repeat as string)) throw new TaskError("invalid", "Repeat must be once, every weekday or every week.");
    out.repeat = input.repeat;
    if (input.repeat === "weekly") {
      const w = input.weekday;
      if (!Number.isInteger(w) || w! < 1 || w! > 7) throw new TaskError("invalid", "Choose a day of the week.");
      out.weekday = w!;
    } else out.weekday = null;
  } else if (input.weekday !== undefined) out.weekday = input.weekday;
  return out;
}

type Row = { id: string; title: string; note: string | null; repeat: string; weekday: number | null; position: number; pausedUntil: Date | null; createdAt: Date };
const toRow = (r: Row, tz: string): TaskRow => ({
  id: r.id,
  title: r.title,
  note: r.note,
  repeat: r.repeat as TaskRepeat,
  weekday: r.weekday,
  position: r.position,
  pausedUntil: r.pausedUntil ? key(r.pausedUntil) : null,
  createdOn: localDayKey(r.createdAt, tz),
});
const zone = async (profileId: string) => (await prisma.profile.findUnique({ where: { id: profileId }, select: { timezone: true } }))?.timezone || "UTC";

export async function listTasks(profileId: string): Promise<TaskRow[]> {
  const [rows, tz] = await Promise.all([prisma.task.findMany({ where: { profileId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }), zone(profileId)]);
  return rows.map((r) => toRow(r, tz));
}

export async function createTask(profileId: string, input: TaskInput): Promise<TaskRow> {
  const data = clean(input, false);
  if ((await prisma.task.count({ where: { profileId } })) >= TASK_LIMIT) throw new TaskError("limit", `You can keep up to ${TASK_LIMIT} activities.`);
  const last = await prisma.task.aggregate({ where: { profileId }, _max: { position: true } });
  const row = await prisma.task.create({
    data: { profileId, title: data.title!, note: data.note ?? null, repeat: data.repeat!, weekday: data.weekday ?? null, position: (last._max.position ?? -1) + 1 },
  });
  return toRow(row, await zone(profileId));
}

/** Edits a task; `pausedUntil` is a day (or null to resume). Null when it isn't this profile's. */
export async function updateTask(profileId: string, id: string, patch: Partial<TaskInput> & { pausedUntil?: string | null }): Promise<TaskRow | null> {
  const data: Record<string, unknown> = clean(patch, true);
  if (patch.pausedUntil !== undefined) {
    if (patch.pausedUntil !== null && !validKey(patch.pausedUntil)) throw new TaskError("invalid", "Choose a valid day to pause until.");
    data.pausedUntil = patch.pausedUntil === null ? null : day(patch.pausedUntil);
  }
  const { count } = await prisma.task.updateMany({ where: { id, profileId }, data });
  if (count === 0) return null;
  const row = await prisma.task.findFirst({ where: { id, profileId } });
  return row ? toRow(row, await zone(profileId)) : null;
}

export async function deleteTask(profileId: string, id: string): Promise<boolean> {
  const { count } = await prisma.task.deleteMany({ where: { id, profileId } });
  return count > 0;
}

/** Marks a task done or skipped for a day (the last call wins). Null when the task isn't this profile's. */
export async function setTaskDone(profileId: string, id: string, date: string, status: "DONE" | "SKIPPED"): Promise<TaskDoneRow | null> {
  if (!validKey(date)) throw new TaskError("invalid", "Choose a valid day.");
  if (status !== "DONE" && status !== "SKIPPED") throw new TaskError("invalid", "Status must be DONE or SKIPPED.");
  if (!(await prisma.task.findFirst({ where: { id, profileId }, select: { id: true } }))) return null;
  await prisma.taskDone.upsert({ where: { taskId_date: { taskId: id, date: day(date) } }, create: { taskId: id, date: day(date), status }, update: { status } });
  return { taskId: id, date, status };
}

export async function clearTaskDone(profileId: string, id: string, date: string): Promise<boolean> {
  if (!validKey(date)) throw new TaskError("invalid", "Choose a valid day.");
  if (!(await prisma.task.findFirst({ where: { id, profileId }, select: { id: true } }))) return false;
  await prisma.taskDone.deleteMany({ where: { taskId: id, date: day(date) } });
  return true;
}

/** Done / skipped marks from `since` (a day) on, for this profile's tasks only. */
export async function listTaskDones(profileId: string, since: string): Promise<TaskDoneRow[]> {
  const rows = await prisma.taskDone.findMany({ where: { task: { profileId }, date: { gte: day(since) } }, orderBy: { date: "asc" } });
  return rows.map((r) => ({ taskId: r.taskId, date: key(r.date), status: r.status as "DONE" | "SKIPPED" }));
}

/** Puts the given tasks first, in that order (ids that aren't this profile's are ignored); the rest follow. */
export async function reorderTasks(profileId: string, ids: string[]): Promise<void> {
  const mine = await prisma.task.findMany({ where: { profileId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const owned = new Set(mine.map((t) => t.id));
  const first = [...new Set(ids)].filter((id) => owned.has(id));
  const order = [...first, ...mine.map((t) => t.id).filter((id) => !first.includes(id))];
  await prisma.$transaction(order.map((id, position) => prisma.task.update({ where: { id }, data: { position } })));
}
