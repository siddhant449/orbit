"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@brandloop/ui";

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
    <Button variant={variant} size="sm" onClick={onClick} disabled={working}>
      <Sparkles aria-hidden /> {working ? "Generating…" : label}
    </Button>
  );

  if (!confirmReplace) return trigger(generate);

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger()}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-6 shadow-xl">
          <AlertDialog.Title className="font-display text-lg font-semibold">Replace your strategy?</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-sm text-ink-muted">
            A new strategy will replace the current one, including your edits.
          </AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
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
