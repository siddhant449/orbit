"use client";

import { useId, useState } from "react";
import { Dialog } from "radix-ui";
import { useSWRConfig } from "swr";
import { Button, Input, Label } from "@brandloop/ui";
import { dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass, textareaClass } from "@/components/dialog-classes";
import { fetchJson, isSavesKey, type SpaceDto } from "@/lib/saves-client";

/** Create a space, or rename / re-describe one (`space` given). Name 1 to 30 characters, description up to 500. */
export function SpaceDialog({ open, onOpenChange, space, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; space?: SpaceDto; onDone?: (space: SpaceDto) => void }) {
  const descId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-md`} aria-describedby={`${descId}-intro`} data-space-dialog>
          <Dialog.Title className={dialogTitleClass}>{space ? "Edit space" : "New space"}</Dialog.Title>
          <Dialog.Description id={`${descId}-intro`} className={dialogDescriptionClass}>
            Spaces keep related saves together. Deleting a space never deletes what is in it.
          </Dialog.Description>
          {/* Mounted only while open, so each opening starts from the space's current values. */}
          <SpaceForm space={space} onClose={() => onOpenChange(false)} onDone={onDone} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SpaceForm({ space, onClose, onDone }: { space?: SpaceDto; onClose: () => void; onDone?: (space: SpaceDto) => void }) {
  const [name, setName] = useState(space?.name ?? "");
  const [description, setDescription] = useState(space?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate } = useSWRConfig();
  const nameId = useId();
  const descId = useId();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = { name, description: description.trim() || (space ? null : undefined) };
      const res = space ? await fetchJson<{ space: SpaceDto }>(`/api/spaces/${space.id}`, "PATCH", body) : await fetchJson<{ space: SpaceDto }>("/api/spaces", "POST", body);
      await mutate(isSavesKey);
      onDone?.(res.space);
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
              if (name.trim() && !busy) void submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Name</Label>
              <Input id={nameId} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Hooks I like" autoComplete="off" />
              <span className="text-[12px] text-text-3">{name.length} of 30</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={descId}>Description (optional)</Label>
              <textarea id={descId} value={description} maxLength={500} rows={3} onChange={(e) => setDescription(e.target.value)} className={textareaClass} />
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
              <Button type="submit" disabled={busy || !name.trim()}>
                {space ? "Save" : "Create space"}
              </Button>
            </div>
          </form>
  );
}
