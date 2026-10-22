"use client";

import { useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button, StatusPill, cn } from "@brandloop/ui";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";
import { deleteProfileAction } from "@/app/(app)/actions";
import { Avatar } from "@/components/shell/avatar";

type Item = { id: string; name: string; avatarUrl: string | null };

export function ProfileList({ profiles, currentProfileId }: { profiles: Item[]; currentProfileId: string | null }) {
  const [target, setTarget] = useState<Item | null>(null);
  const [pending, startTransition] = useTransition();
  const onlyOne = profiles.length <= 1;

  function confirmDelete() {
    if (!target) return;
    const { id, name } = target;
    startTransition(async () => {
      const result = await deleteProfileAction(id);
      if (result.ok) toast.success(`Deleted ${name}`);
      else toast.error(result.error);
      setTarget(null);
    });
  }

  return (
    <>
      <ul className="orbit-panel mt-4 divide-y divide-line p-0">
        {profiles.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Avatar name={p.name} src={p.avatarUrl} className="size-8" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">{p.name}</span>
            {p.id === currentProfileId && (
              <StatusPill tone="accent" className="min-h-6 px-2.5 text-[11px]">
                Current
              </StatusPill>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${p.name}`}
              title={onlyOne ? "You need at least one profile" : `Delete ${p.name}`}
              disabled={onlyOne}
              onClick={() => setTarget(p)}
            >
              <Trash2 aria-hidden strokeWidth={1.6} />
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog.Root open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogOverlayClass} />
          <AlertDialog.Content className={cn(dialogContentClass, "max-w-md")}>
            <AlertDialog.Title className={dialogTitleClass}>Delete {target?.name}?</AlertDialog.Title>
            <AlertDialog.Description className={dialogDescriptionClass}>
              It disappears from your team, along with its posts, chats and voice settings.
            </AlertDialog.Description>
            <div className={dialogActionsClass}>
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <Button variant="danger" onClick={confirmDelete} disabled={pending}>
                {pending ? "Deleting…" : "Delete profile"}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
