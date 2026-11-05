"use client";

import { useId, useState } from "react";
import { Dialog } from "radix-ui";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, cn } from "@brandloop/ui";
import { dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "@/components/dialog-classes";
import { GOAL_PRESETS, PRESET_LABELS, goalProblem, type GoalDto, type GoalPresetId, type GoalValues } from "@/lib/progress/goals";
import { fetchJson } from "@/lib/saves-client";

export type Tally = { comments: number; dms: number; connections: number };
type Kind = keyof Tally;

const ROWS: { kind: Kind; label: (n: number) => string; noun: string }[] = [
  { kind: "comments", label: (n) => `${n} comments`, noun: "comment" },
  { kind: "dms", label: (n) => `${n} DMs`, noun: "DM" },
  { kind: "connections", label: (n) => `${n} connection requests`, noun: "connection request" },
];

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${value} of ${max}`}
      className="h-1.5 overflow-hidden rounded-pill bg-line"
    >
      <div className="h-full rounded-pill bg-accent-text" style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

const stepper =
  "orbit-transition grid size-8 shrink-0 place-items-center rounded-full border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4";

/** This week's goals: posts counted from "Mark as posted", the rest counted by the writer with +1 / -1. */
export function GoalsPanel({ goal, tally, weekPosted, onGoal, onTally }: { goal: GoalDto; tally: Tally; weekPosted: number; onGoal: (g: GoalDto) => void; onTally: (t: Tally) => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);

  async function adjust(kind: Kind, delta: 1 | -1) {
    if (busy) return;
    setBusy(kind);
    try {
      const res = await fetchJson<{ count: number }>("/api/goals/tally", "POST", { kind, delta });
      onTally({ ...tally, [kind]: res.count });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the count. Try again.");
    }
    setBusy(null);
  }

  return (
    <section aria-labelledby="goals-title" className="orbit-panel relative flex flex-col gap-3.5 overflow-hidden !rounded-[20px] p-6">
      <div className="relative flex items-center justify-between gap-3">
        <h2 id="goals-title" className="text-[13px] font-normal text-text-2">
          This week&apos;s goals
        </h2>
        <GoalDialog goal={goal} onSaved={onGoal} />
      </div>
      <ul aria-labelledby="goals-title" className="flex flex-col gap-3">
        <li className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-[13px]">
            <span className="font-medium text-text">{`Post ${goal.posts} times`}</span>
            <span className="tabular-nums text-text-2">{`${weekPosted} / ${goal.posts}`}</span>
          </div>
          <Bar label="Posts" value={weekPosted} max={goal.posts} />
        </li>
        {ROWS.map((r) => (
          <li key={r.kind} className="flex flex-col gap-1.5" data-goal={r.kind}>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="font-medium text-text">{r.label(goal[r.kind])}</span>
              <span className="flex items-center gap-2">
                <button type="button" className={stepper} aria-label={`Remove one ${r.noun}`} disabled={busy !== null || tally[r.kind] === 0} onClick={() => void adjust(r.kind, -1)}>
                  <Minus aria-hidden="true" />
                </button>
                <span className="min-w-[4.5ch] text-center tabular-nums text-text-2" data-count={r.kind}>{`${tally[r.kind]} / ${goal[r.kind]}`}</span>
                <button type="button" className={stepper} aria-label={`Add one ${r.noun}`} disabled={busy !== null} onClick={() => void adjust(r.kind, 1)}>
                  <Plus aria-hidden="true" />
                </button>
              </span>
            </div>
            <Bar label={r.kind === "dms" ? "DMs" : r.noun[0]!.toUpperCase() + r.noun.slice(1) + "s"} value={tally[r.kind]} max={goal[r.kind]} />
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-[1.5] text-text-2">Posts count when you mark them as posted. Counted by you until LinkedIn is connected.</p>
    </section>
  );
}

const FIELDS: { key: keyof GoalValues; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "dms", label: "DMs" },
  { key: "connections", label: "Connection requests" },
];

function GoalDialog({ goal, onSaved }: { goal: GoalDto; onSaved: (g: GoalDto) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="orbit-transition inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm text-[12px] text-text-2 hover:text-text">Edit</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-md`}>
          <Dialog.Title className={dialogTitleClass}>Weekly goals</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>Pick a pace, or set your own numbers. They apply to every week.</Dialog.Description>
          <GoalForm goal={goal} onClose={() => setOpen(false)} onSaved={onSaved} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GoalForm({ goal, onClose, onSaved }: { goal: GoalDto; onClose: () => void; onSaved: (g: GoalDto) => void }) {
  const [choice, setChoice] = useState<GoalPresetId | "custom">(goal.preset);
  const [custom, setCustom] = useState<GoalValues>({ posts: goal.posts, comments: goal.comments, dms: goal.dms, connections: goal.connections });
  const [busy, setBusy] = useState(false);
  const group = useId();
  const problem = choice === "custom" ? goalProblem(custom) : null;

  async function save() {
    setBusy(true);
    try {
      const res = await fetchJson<{ goal: GoalDto }>("/api/goals", "PUT", choice === "custom" ? { custom } : { preset: choice });
      onSaved(res.goal);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your goals. Try again.");
    }
    setBusy(false);
  }

  return (
    <form
      className="mt-5 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !problem) void save();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Pace</legend>
        {(Object.keys(GOAL_PRESETS) as GoalPresetId[]).map((id) => {
          const g = GOAL_PRESETS[id];
          return (
            <label key={id} className={cn("orbit-transition flex cursor-pointer items-start gap-3 rounded-card-sm border p-3.5", choice === id ? "border-accent-text bg-accent-wash" : "border-line-control hover:border-text-3")}>
              <input type="radio" name={group} value={id} checked={choice === id} onChange={() => setChoice(id)} className="mt-1 accent-[var(--accent-text)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-text">{PRESET_LABELS[id]}</span>
                <span className="text-[12px] text-text-2">{`${g.posts} posts · ${g.comments} comments · ${g.dms} DMs · ${g.connections} connections`}</span>
              </span>
            </label>
          );
        })}
        <label className={cn("orbit-transition flex cursor-pointer items-start gap-3 rounded-card-sm border p-3.5", choice === "custom" ? "border-accent-text bg-accent-wash" : "border-line-control hover:border-text-3")}>
          <input type="radio" name={group} value="custom" checked={choice === "custom"} onChange={() => setChoice("custom")} className="mt-1 accent-[var(--accent-text)]" />
          <span className="text-[14px] font-medium text-text">Custom numbers</span>
        </label>
      </fieldset>
      {choice === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`${group}-${f.key}`}>{f.label}</Label>
              <Input id={`${group}-${f.key}`} type="number" inputMode="numeric" min={f.key === "posts" ? 1 : 0} value={custom[f.key]} onChange={(e) => setCustom({ ...custom, [f.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      )}
      {problem && (
        <p role="alert" className="text-[13px] text-danger">
          {problem}
        </p>
      )}
      <div className={dialogActionsClass}>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={busy || Boolean(problem)}>
          {busy ? "Saving…" : "Save goals"}
        </Button>
      </div>
    </form>
  );
}
