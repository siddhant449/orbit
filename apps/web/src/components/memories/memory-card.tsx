"use client";

import { useRef, useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, cn } from "@brandloop/ui";
import { deleteMemoryLineAction, editMemoryLineAction } from "@/app/(app)/actions";
import { AddMemory } from "./add-memory";

export type MemoryLineView = { key: string; index: number; text: string; depth: number };
export type MemoryGroupView = { key: string; title?: string; updated: string; lines: MemoryLineView[] };

function LineRow({ line }: { line: MemoryLineView }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.text);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const editBtn = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);

  function save() {
    if (busy.current) return;
    const next = draft.trim();
    if (!next || next === line.text) {
      cancel();
      return;
    }
    busy.current = true;
    startTransition(async () => {
      const result = await editMemoryLineAction(line.key, line.index, next, line.text);
      busy.current = false;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      toast.success("Memory updated");
    });
  }

  function cancel() {
    busy.current = true;
    setTimeout(() => (busy.current = false), 0);
    setDraft(line.text);
    setEditing(false);
    requestAnimationFrame(() => editBtn.current?.focus());
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMemoryLineAction(line.key, line.index, line.text);
      setConfirming(false);
      if (!result.ok) toast.error(result.error);
      else toast.success("Memory deleted");
    });
  }

  return (
    <li className="group flex items-start gap-2 py-1.5" style={{ paddingLeft: `${line.depth * 20}px` }}>
      <span aria-hidden className="mt-[0.8rem] size-1.5 shrink-0 rounded-full bg-jade/60" />
      {editing ? (
        <textarea
          aria-label="Edit memory"
          autoFocus
          rows={Math.max(1, Math.ceil(draft.length / 70))}
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="min-w-0 flex-1 resize-none rounded-row border border-jade bg-paper px-2.5 py-1.5 text-[15px] leading-relaxed text-ink"
        />
      ) : (
        <button
          ref={editBtn}
          type="button"
          onClick={() => {
            setDraft(line.text);
            setEditing(true);
          }}
          aria-label={`Edit: ${line.text}`}
          className="min-w-0 flex-1 rounded-row px-2.5 py-1.5 text-left text-[15px] leading-relaxed text-ink hover:bg-surface-sunk"
        >
          {line.text}
        </button>
      )}
      <AlertDialog.Root open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete: ${line.text}`}
            className="mt-0.5 text-ink-faint md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <Trash2 aria-hidden />
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-6 shadow-xl">
            <AlertDialog.Title className="font-display text-lg font-semibold">Delete this memory?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-ink-muted">
              “{line.text}” will no longer be used when writing your posts.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <Button variant="danger" disabled={pending} onClick={remove}>
                {pending ? "Deleting…" : "Delete memory"}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </li>
  );
}

function Group({ group, nested }: { group: MemoryGroupView; nested: boolean }) {
  return (
    <div className={cn(nested && "rounded-row bg-paper px-3 py-3")}>
      {group.title && (
        <div className="flex items-baseline justify-between gap-3 px-2.5">
          <h3 className="font-display text-[15px] font-semibold">{group.title}</h3>
          <p className="text-xs text-ink-faint">Updated {group.updated}</p>
        </div>
      )}
      {group.lines.length > 0 ? (
        <ul className="mt-1">
          {group.lines.map((line) => (
            <LineRow key={`${line.key}:${line.index}:${line.text}`} line={line} />
          ))}
        </ul>
      ) : (
        <p className="px-2.5 py-2 text-sm text-ink-muted">Nothing here yet.</p>
      )}
    </div>
  );
}

export function MemoryCard({
  title,
  description,
  groups,
  updated,
  addKey,
  addTopic = false,
}: {
  title: string;
  description: string;
  groups: MemoryGroupView[];
  updated?: string;
  addKey?: string;
  addTopic?: boolean;
}) {
  const nested = groups.some((g) => g.title);
  return (
    <section aria-label={title} className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        {updated && <p className="text-xs text-ink-faint">Updated {updated}</p>}
      </div>
      <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
      <div className={cn("mt-3", nested && "space-y-3")}>
        {groups.length === 0 ? (
          <p className="py-2 text-sm text-ink-muted">Nothing here yet.</p>
        ) : (
          groups.map((g) => <Group key={g.key} group={g} nested={nested} />)
        )}
      </div>
      {(addKey || addTopic) && (
        <div className="mt-3 border-t border-line pt-3">
          <AddMemory
            memoryKey={addKey ?? ""}
            askTopic={addTopic}
            label={addTopic ? "Add a topic memory" : "Add a memory"}
          />
        </div>
      )}
    </section>
  );
}
