"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@brandloop/ui";
import { IdeasIcon } from "@brandloop/ui/icons";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function GenerateButton({ label = "Generate my strategy", variant = "primary", confirmReplace = false }: { label?: string; variant?: "primary" | "secondary"; confirmReplace?: boolean }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function poll(jobId: string) {
    for (let i = 0; i < 90; i++) {
      await wait(2000);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) continue;
        const job = (await res.json()) as { status: string; error?: string | null };
        if (job.status === "DONE") {
          router.refresh();
          toast.success("Strategy ready");
          return;
        }
        if (job.status === "FAILED") {
          toast.error(job.error || "Couldn't generate your strategy");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    toast.error("This is taking longer than expected. Check back soon.");
  }

  async function generate() {
    setWorking(true);
    try {
      const res = await fetch("/api/strategy/generate", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !body.jobId) {
        toast.error(body.error || "Couldn't generate your strategy");
        return;
      }
      toast("Building your strategy. It will appear here in a moment.");
      await poll(body.jobId);
    } finally {
      setWorking(false);
    }
  }

  const trigger = (onClick?: () => void) => (
    <Button variant={variant} size="md" onClick={onClick} disabled={working}>
      <IdeasIcon /> {working ? "Generating…" : label}
    </Button>
  );

  if (!confirmReplace) return trigger(generate);

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger()}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlayClass} />
        <AlertDialog.Content className={`${dialogContentClass} max-w-md`}>
          <AlertDialog.Title className={dialogTitleClass}>Replace your strategy?</AlertDialog.Title>
          <AlertDialog.Description className={dialogDescriptionClass}>
            A new strategy will replace the current one, including your edits.
          </AlertDialog.Description>
          <div className={dialogActionsClass}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={() => void generate()}>Replace strategy</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
