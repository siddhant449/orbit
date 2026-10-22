"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@brandloop/ui";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";
import { NETWORK_ERROR } from "./add-knowledge";

/** Deletes one knowledge item after an in-app confirmation (DELETE /api/knowledge-base/[id]). */
export function DeleteKnowledge({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/knowledge-base/${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {
        toast.error(NETWORK_ERROR);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Couldn't delete that");
        return;
      }
      toast.success("Deleted from knowledge");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${title}`} className="-my-2 -mr-2 size-9 text-text-2">
          <Trash2 aria-hidden strokeWidth={1.6} />
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlayClass} />
        <AlertDialog.Content className={`${dialogContentClass} max-w-md`}>
          <AlertDialog.Title className={dialogTitleClass}>Delete this from knowledge?</AlertDialog.Title>
          <AlertDialog.Description className={dialogDescriptionClass}>
            “{title}” will no longer be used when Orbit writes for this profile.
          </AlertDialog.Description>
          <div className={dialogActionsClass}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialog.Cancel>
            <Button variant="danger" disabled={pending} onClick={() => void remove()}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
