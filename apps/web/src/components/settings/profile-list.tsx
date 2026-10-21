"use client";

import { useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@brandloop/ui";
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
      <ul className="mt-4 divide-y divide-line rounded-card border border-line">
        {profiles.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={p.name} src={p.avatarUrl} className="size-8" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
            {p.id === currentProfileId && (
              <span className="type-caption rounded-control border border-keyline px-2 py-0.5 text-ink">Current</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${p.name}`}
              title={onlyOne ? "You need at least one profile" : `Delete ${p.name}`}
              disabled={onlyOne}
              onClick={() => setTarget(p)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog.Root open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=closed]:animate-[fade-out_120ms_var(--ease-exit)_both] data-[state=open]:animate-[fade-in_180ms_var(--ease-ink)_both]" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 plate plate--overlay p-6 data-[state=closed]:animate-[fade-out_120ms_var(--ease-exit)_both] data-[state=open]:animate-[plate-in_180ms_var(--ease-ink)_both]">
            <AlertDialog.Title className="type-title-2">Delete {target?.name}?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-ink-muted">
              It disappears from your team, along with its posts, chats and voice settings.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
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
