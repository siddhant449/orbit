"use client";

import { useRef, useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { Button, cn } from "@brandloop/ui";
import { Trash2 } from "lucide-react";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";
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
    <li className="group flex items-start gap-1.5" style={{ paddingLeft: `${line.depth * 20}px` }}>
      <span aria-hidden className="mt-[17px] size-1.5 shrink-0 rounded-full bg-text-3" />
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
          className="min-w-0 flex-1 resize-none rounded-[12px] border border-accent-text bg-ground px-3 py-2 text-[15px] leading-[1.55] text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
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
          className="orbit-transition min-w-0 flex-1 cursor-text rounded-[12px] px-3 py-2 text-left text-[15px] leading-[1.55] text-text-soft hover:bg-line-soft hover:text-text"
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
            className="mt-0.5 size-9 text-text-2 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <Trash2 aria-hidden strokeWidth={1.6} />
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogOverlayClass} />
          <AlertDialog.Content className={cn(dialogContentClass, "max-w-md")}>
            <AlertDialog.Title className={dialogTitleClass}>Delete this memory?</AlertDialog.Title>
            <AlertDialog.Description className={dialogDescriptionClass}>
              “{line.text}” will no longer be used when writing your posts.
            </AlertDialog.Description>
            <div className={dialogActionsClass}>
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
    <div className={cn(nested && "rounded-card-sm bg-ground/60 p-3 [.light_&]:bg-ground")}>
      {group.title && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 pb-1">
          {/* Memory-tag style label (system §6.14): the data register, a leading accent dot. */}
          <h3 className="inline-flex items-center gap-2 rounded-pill border border-line-4 py-1 pl-2 pr-3 font-mono text-[12px] tracking-[0.04em] text-text-soft">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-text" />
            {group.title}
          </h3>
          <p className="text-[12px] text-text-2">Updated {group.updated}</p>
        </div>
      )}
      {group.lines.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {group.lines.map((line) => (
            <LineRow key={`${line.key}:${line.index}:${line.text}`} line={line} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[14px] text-text-2">Nothing here yet.</p>
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
    <section aria-label={title} className="orbit-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="type-card-title text-text">{title}</h2>
        {updated && <p className="text-[12px] text-text-2">Updated {updated}</p>}
      </div>
      <p className="mt-1.5 text-[14px] text-text-2">{description}</p>
      <div className={cn("mt-4", nested && "flex flex-col gap-2.5")}>
        {groups.length === 0 ? (
          <p className="py-2 text-[14px] text-text-2">Nothing here yet.</p>
        ) : (
          groups.map((g) => <Group key={g.key} group={g} nested={nested} />)
        )}
      </div>
      {(addKey || addTopic) && (
        <div className="mt-4 border-t border-line pt-4">
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
