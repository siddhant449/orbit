"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button, Label, cn } from "@brandloop/ui";
import { ChevronRightIcon, CopyIcon, PlusIcon } from "@brandloop/ui/icons";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
  textareaClass,
} from "@/components/dialog-classes";

export const IMPORT_PROMPT =
  "I'm moving to a new writing assistant. List everything you know about me — background, work, interests, opinions, audience and how I like to write — as plain-text bullet points.";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportDialog({ variant = "secondary" }: { variant?: "secondary" | "primary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [help, setHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function poll(jobId: string) {
    for (let i = 0; i < 90; i++) {
      await wait(2000);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) continue;
        const job = (await res.json()) as { status: string; error?: string | null };
        if (job.status === "DONE") {
          router.refresh();
          toast.success("Memories imported");
          return;
        }
        if (job.status === "FAILED") {
          toast.error(job.error || "Import failed");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    toast.error("Import is taking longer than expected. Check back soon.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/memories/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !body.jobId) {
        toast.error(body.error || "Import failed");
        return;
      }
      toast("Importing your memories. They'll appear here in a moment.");
      setOpen(false);
      setText("");
      void poll(body.jobId);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      toast.success("Prompt copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant={variant} size="md">
          <PlusIcon /> Import memories
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={cn(dialogContentClass, "max-w-lg")}>
          <Dialog.Title className={dialogTitleClass}>Import memories</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>
            Bring what another assistant knows about you, so your posts sound like you from the start.
          </Dialog.Description>

          <div className="mt-5 rounded-card-sm border border-line-2">
            <button
              type="button"
              aria-expanded={help}
              aria-controls="import-help"
              onClick={() => setHelp((v) => !v)}
              className="orbit-transition flex min-h-11 w-full items-center gap-2.5 rounded-card-sm px-3.5 text-left text-[13px] font-medium text-text hover:bg-line-soft"
            >
              <ChevronRightIcon
                size={14}
                className={cn("shrink-0 text-text-2 motion-safe:transition-transform motion-safe:duration-[400ms]", help && "rotate-90")}
              />
              How to get your memories
            </button>
            {help && (
              <div id="import-help" className="flex flex-col items-start gap-3 border-t border-line-2 px-3.5 py-3.5">
                <p className="text-[13px] leading-[1.55] text-text-2">
                  Paste this into ChatGPT, Claude or whichever assistant you use now, then paste its answer below.
                </p>
                <p className="rounded-[12px] bg-ground p-3.5 text-[13px] leading-relaxed text-text-soft" data-testid="import-prompt">
                  {IMPORT_PROMPT}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={copyPrompt}>
                  <CopyIcon /> Copy prompt
                </Button>
              </div>
            )}
          </div>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-1.5">
            <Label htmlFor="import-text">Paste your memories</Label>
            <textarea
              id="import-text"
              required
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste anything here, in any format. We'll turn it into memories."
              className={textareaClass}
            />
            <p className="text-xs text-text-2">Importing runs in the background. You can close this and keep working.</p>
            <div className={cn(dialogActionsClass, "mt-4")}>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={submitting || !text.trim()}>
                {submitting ? "Importing…" : "Import memories"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
