"use client";

import { useState, useTransition } from "react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button, Hint, Input, Label } from "@brandloop/ui";
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-6 shadow-xl">
          <Dialog.Title className="font-display text-lg font-semibold">Add a profile</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            Each profile has its own voice, posts and LinkedIn account. Use one per person or brand you write for.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-5 space-y-2">
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
            <div className="flex justify-end gap-2 pt-4">
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
