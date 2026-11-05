"use client";

import { useId, useState } from "react";
import { Dialog } from "radix-ui";
import { Button, Input, Label, NativeSelect } from "@brandloop/ui";
import { dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass, textareaClass } from "@/components/dialog-classes";
import { fetchJson } from "@/lib/saves-client";
import type { TaskLike, TaskRepeat } from "@/lib/progress/tasks";

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Add an activity, or edit one (`task` given): a title, an optional note and how often it repeats. */
export function TaskDialog({ open, onOpenChange, task, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; task?: TaskLike; onSaved: (task: TaskLike) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-md`}>
          <Dialog.Title className={dialogTitleClass}>{task ? "Edit activity" : "Add activity"}</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>Something you want to do again and again, or just once. Tick it off on the day.</Dialog.Description>
          {/* Mounted only while open, so each opening starts from the task's current values. */}
          <TaskForm task={task} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TaskForm({ task, onClose, onSaved }: { task?: TaskLike; onClose: () => void; onSaved: (task: TaskLike) => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [repeat, setRepeat] = useState<TaskRepeat>(task?.repeat ?? "once");
  const [weekday, setWeekday] = useState(task?.weekday ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { title: useId(), note: useId(), repeat: useId(), weekday: useId() };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = { title, note: note.trim() || (task ? null : undefined), repeat, weekday: repeat === "weekly" ? weekday : null };
      const res = task ? await fetchJson<{ task: TaskLike }>(`/api/tasks/${task.id}`, "PATCH", body) : await fetchJson<{ task: TaskLike }>("/api/tasks", "POST", body);
      onSaved(res.task);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  }

  return (
    <form
      className="mt-5 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && !busy) void submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.title}>Title</Label>
        <Input id={ids.title} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Comment on 5 posts" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.note}>Note (optional)</Label>
        <textarea id={ids.note} value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} className={textareaClass} />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-[170px] flex-1 flex-col gap-1.5">
          <Label htmlFor={ids.repeat}>Repeats</Label>
          <NativeSelect id={ids.repeat} value={repeat} onChange={(e) => setRepeat(e.target.value as TaskRepeat)}>
            <option value="once">Just once</option>
            <option value="weekdays">Every weekday</option>
            <option value="weekly">Every week</option>
          </NativeSelect>
        </div>
        {repeat === "weekly" && (
          <div className="flex min-w-[170px] flex-1 flex-col gap-1.5">
            <Label htmlFor={ids.weekday}>On</Label>
            <NativeSelect id={ids.weekday} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAY_NAMES.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className={dialogActionsClass}>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : task ? "Save" : "Add activity"}
        </Button>
      </div>
    </form>
  );
}
