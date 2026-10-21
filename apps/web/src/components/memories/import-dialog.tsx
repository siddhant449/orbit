"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { ChevronDown, Copy, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, Label } from "@brandloop/ui";

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
        <Button variant={variant} size="sm">
          <Upload aria-hidden /> Import memories
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl">
          <Dialog.Title className="font-display text-lg font-semibold">Import memories</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            Bring what another assistant knows about you, so your posts sound like you from the start.
          </Dialog.Description>

          <div className="mt-4 rounded-row border border-line">
            <button
              type="button"
              aria-expanded={help}
              aria-controls="import-help"
              onClick={() => setHelp((v) => !v)}
              className="flex w-full items-center justify-between rounded-row px-3 py-2.5 text-left text-sm font-medium"
            >
              How to get your memories
              <ChevronDown aria-hidden className={`size-4 transition-transform ${help ? "rotate-180" : ""}`} />
            </button>
            {help && (
              <div id="import-help" className="space-y-3 border-t border-line px-3 py-3">
                <p className="text-sm text-ink-muted">Paste this into ChatGPT, Claude or whichever assistant you use now, then paste its answer below.</p>
                <p className="rounded-row bg-surface-sunk p-3 text-sm leading-relaxed" data-testid="import-prompt">
                  {IMPORT_PROMPT}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={copyPrompt}>
                  <Copy aria-hidden /> Copy prompt
                </Button>
              </div>
            )}
          </div>

          <form onSubmit={submit} className="mt-4 space-y-2">
            <Label htmlFor="import-text">Paste your memories</Label>
            <textarea
              id="import-text"
              required
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste anything here, in any format. We'll turn it into memories."
              className="w-full resize-y rounded-row border border-line bg-paper px-3 py-2 text-sm leading-relaxed placeholder:text-ink-faint"
            />
            <p className="text-xs text-ink-muted">Importing runs in the background. You can close this and keep working.</p>
            <div className="flex justify-end gap-2 pt-3">
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
