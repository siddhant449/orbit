"use client";

import Link from "next/link";
import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
import { CheckIcon } from "@brandloop/ui/icons";
import { menuContentClass, menuItemClass } from "@/components/shell/profile-menu";
import { moveItem } from "@/components/saves/order";
import { addDays, dayLabel, type DayKey } from "@/lib/progress/days";
import { carriedLabel, dayProgress, pauseUntil, tasksForDate, type DoneLike, type TaskLike } from "@/lib/progress/tasks";
import { fetchJson } from "@/lib/saves-client";

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type Todos = ReturnType<typeof useTodos>;

/** The to-dos and their marks, with every change going through the API first and then into state. */
export function useTodos(initialTasks: TaskLike[], initialDones: DoneLike[], today: DayKey) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dones, setDones] = useState(initialDones);
  const [busy, setBusy] = useState(false);

  async function guard(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
    setBusy(false);
  }
  const mark = (taskId: string, date: DayKey, status: "DONE" | "SKIPPED" | null) =>
    setDones((all) => [...all.filter((d) => !(d.taskId === taskId && d.date === date)), ...(status ? [{ taskId, date, status }] : [])]);
  const replace = (task: TaskLike) => setTasks((all) => (all.some((t) => t.id === task.id) ? all.map((t) => (t.id === task.id ? task : t)) : [...all, task]));

  return {
    tasks,
    dones,
    busy,
    saved: replace,
    tick: (task: TaskLike, done: boolean) =>
      guard(async () => {
        if (done) {
          await fetchJson(`/api/tasks/${task.id}/done?date=${today}`, "DELETE");
          mark(task.id, today, null);
        } else {
          await fetchJson(`/api/tasks/${task.id}/done`, "POST", { date: today, status: "DONE" });
          mark(task.id, today, "DONE");
        }
      }),
    skip: (task: TaskLike) =>
      guard(async () => {
        await fetchJson(`/api/tasks/${task.id}/done`, "POST", { date: today, status: "SKIPPED" });
        mark(task.id, today, "SKIPPED");
      }),
    unskip: (task: TaskLike) =>
      guard(async () => {
        await fetchJson(`/api/tasks/${task.id}/done?date=${today}`, "DELETE");
        mark(task.id, today, null);
      }),
    pause: (task: TaskLike, days: number) =>
      guard(async () => {
        const until = pauseUntil(today, days);
        if (!until) throw new Error("A task can be paused for up to 28 days.");
        replace((await fetchJson<{ task: TaskLike }>(`/api/tasks/${task.id}`, "PATCH", { pausedUntil: until })).task);
      }),
    resume: (task: TaskLike) =>
      guard(async () => {
        replace((await fetchJson<{ task: TaskLike }>(`/api/tasks/${task.id}`, "PATCH", { pausedUntil: null })).task);
      }),
    remove: (task: TaskLike) =>
      guard(async () => {
        await fetchJson(`/api/tasks/${task.id}`, "DELETE");
        setTasks((all) => all.filter((t) => t.id !== task.id));
      }),
    /** Moves the task at `from` to `to` among the ids given (the order on screen), then saves the whole order. */
    reorder: (visibleIds: string[], from: number, to: number) =>
      guard(async () => {
        const next = moveItem(visibleIds, from, to);
        const rest = tasks.map((t) => t.id).filter((id) => !next.includes(id));
        const ids = [...next, ...rest];
        const res = await fetchJson<{ tasks: TaskLike[] }>("/api/tasks/order", "PUT", { ids });
        setTasks(res.tasks);
      }),
  };
}

function CheckCircle({ done }: { done: boolean }) {
  return done ? (
    <span aria-hidden="true" className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent-text text-on-accent">
      <CheckIcon className="size-3" />
    </span>
  ) : (
    <span aria-hidden="true" className="block size-[18px] shrink-0 rounded-full border border-text-2" />
  );
}

const repeatText = (t: TaskLike) => (t.repeat === "weekdays" ? "Every weekday" : t.repeat === "weekly" ? `Every ${WEEKDAY_NAMES[(t.weekday ?? 1) - 1]}` : "One-off");

/** Today: the post row, then the to-dos with a done tick, a menu (skip, pause, reorder, edit, delete) and drag to reorder. */
export function TodoPanel({
  today,
  resets,
  todos,
  postedToday,
  postHref,
  onEdit,
}: {
  today: DayKey;
  resets: string;
  todos: Todos;
  postedToday: boolean;
  postHref: string;
  onEdit: (task: TaskLike) => void;
}) {
  const rows = tasksForDate(todos.tasks, todos.dones, today, today);
  const shown = rows.filter((r) => r.status !== "skipped");
  const skipped = rows.filter((r) => r.status === "skipped");
  const paused = todos.tasks.filter((t) => t.pausedUntil && today <= t.pausedUntil);
  const { done, total } = dayProgress(rows);
  const left = total - done + (postedToday ? 0 : 1);
  const ids = shown.map((r) => r.task.id);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <section aria-labelledby="today-title" className="orbit-panel flex min-w-0 flex-[1_1_420px] flex-col gap-1 !rounded-[20px] px-2.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pb-2.5 pt-2">
        <h2 id="today-title" className="text-[14px] font-medium text-text">
          Today <span className="font-normal text-text-2">{dayLabel(today)}</span>
        </h2>
        <span className="text-[12px] text-text-2">
          {left === 0 ? "Done for today" : `${left} left`} · {resets}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        <li className="flex items-center gap-3 rounded-[12px] px-3 py-2.5">
          <CheckCircle done={postedToday} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn("text-[14px] font-medium", postedToday ? "text-text-2 line-through" : "text-text")}>
              Post today
              {postedToday && <span className="sr-only"> (done)</span>}
            </span>
            <span className="text-[12px] text-text-2">Write a post with Orbit, then mark it as posted once it&apos;s out.</span>
          </span>
          <Button asChild size="sm" variant={postedToday ? "secondary" : "primary"} className="shrink-0 text-[12px]">
            <Link href={postHref}>{postedToday ? "Write another" : "Write"}</Link>
          </Button>
        </li>
        {shown.map((r, i) => {
          const isDone = r.status === "done";
          return (
            <li
              key={r.task.id}
              data-task={r.task.id}
              draggable
              onDragStart={(e) => {
                setDragId(r.task.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => dragId && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId ? ids.indexOf(dragId) : -1;
                setDragId(null);
                if (from >= 0 && from !== i) void todos.reorder(ids, from, i);
              }}
              onDragEnd={() => setDragId(null)}
              className={cn("flex items-start gap-3 rounded-[12px] px-3 py-2.5", dragId === r.task.id && "opacity-50")}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={isDone}
                aria-label={r.task.title}
                disabled={todos.busy}
                onClick={() => void todos.tick(r.task, isDone)}
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full disabled:opacity-60"
              >
                <CheckCircle done={isDone} />
              </button>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("text-[14px] font-medium", isDone ? "text-text-2 line-through" : "text-text")}>{r.task.title}</span>
                {r.task.note && <span className="text-[12px] text-text-2">{r.task.note}</span>}
                <span className="text-[11px] text-text-2">
                  {repeatText(r.task)}
                  {r.carriedOver && ` · ${carriedLabel(r.task.createdOn, today, (k) => dayLabel(k))}`}
                </span>
              </span>
              <TaskMenu task={r.task} index={i} count={shown.length} onMove={(to) => void todos.reorder(ids, i, to)} onEdit={onEdit} todos={todos} />
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="px-3 py-2 text-[12px] text-text-2">No activities yet. Add one for something you want to do every day or week, and it shows up here.</p>}
      {skipped.length > 0 && (
        <div className="px-3 pt-2">
          <p className="text-[11px] text-text-2">Skipped today</p>
          <ul>
            {skipped.map((r) => (
              <li key={r.task.id} className="flex items-center justify-between gap-3 py-1 text-[12px] text-text-2">
                <span className="truncate">{r.task.title}</span>
                <Button variant="micro" size="sm" disabled={todos.busy} onClick={() => void todos.unskip(r.task)}>
                  Undo skip
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {paused.length > 0 && (
        <div className="px-3 pt-2">
          <p className="text-[11px] text-text-2">Paused</p>
          <ul>
            {paused.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-1 text-[12px] text-text-2">
                <span className="truncate">
                  {t.title} <span className="text-text-2">· until {dayLabel(addDays(t.pausedUntil!, 1), { weekday: false })}</span>
                </span>
                <Button variant="micro" size="sm" disabled={todos.busy} onClick={() => void todos.resume(t)}>
                  Resume
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TaskMenu({ task, index, count, onMove, onEdit, todos }: { task: TaskLike; index: number; count: number; onMove: (to: number) => void; onEdit: (t: TaskLike) => void; todos: Todos }) {
  const item = cn(menuItemClass, "data-[disabled]:pointer-events-none data-[disabled]:opacity-40");
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Options for ${task.title}`}
        className="orbit-transition grid size-8 shrink-0 place-items-center rounded-full text-text-2 hover:bg-line-row hover:text-text max-sm:size-11 [&_svg]:size-4"
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={16} className={cn(menuContentClass, "w-52")}>
          <DropdownMenu.Item className={item} disabled={index === 0} onSelect={() => onMove(index - 1)}>
            <ArrowUp aria-hidden="true" /> Move up
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} disabled={index === count - 1} onSelect={() => onMove(index + 1)}>
            <ArrowDown aria-hidden="true" /> Move down
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => onEdit(task)}>
            Edit
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void todos.skip(task)}>
            Skip today
          </DropdownMenu.Item>
          {task.repeat !== "once" && (
            <>
              <DropdownMenu.Item className={item} onSelect={() => void todos.pause(task, 7)}>
                Pause for a week
              </DropdownMenu.Item>
              <DropdownMenu.Item className={item} onSelect={() => void todos.pause(task, 28)}>
                Pause for 4 weeks
              </DropdownMenu.Item>
            </>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={cn(item, "text-danger data-[highlighted]:text-danger")} onSelect={() => void todos.remove(task)}>
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
