"use client";

import { useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button, Hint, Input, Label, cn } from "@brandloop/ui";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";
import { createProfileAction } from "@/app/(app)/actions";

export function AddProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createProfileAction(name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Switched to ${name.trim()}`);
      setName("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={cn(dialogContentClass, "max-w-md")}>
          <Dialog.Title className={dialogTitleClass}>Add a profile</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>
            Each profile has its own voice, posts and LinkedIn account. Use one per person or brand you write for.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Profile name</Label>
            <Input
              id="profile-name"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Raman"
            />
            <Hint>Usually the name of the person posting.</Hint>
            <div className={cn(dialogActionsClass, "mt-4")}>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Adding…" : "Add profile"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
