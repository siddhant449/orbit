"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { PlusIcon } from "@brandloop/ui/icons";
import { Button, Hint, Input, Label, Segmented } from "@brandloop/ui";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
  textareaClass,
} from "@/components/dialog-classes";
import { KNOWLEDGE_MIN_WORDS, knowledgePayload, wordCount, type AddFields } from "./knowledge-view";

export const NETWORK_ERROR = "Couldn't reach Orbit. Check your connection and try again.";

const KINDS = [
  { value: "link", label: "Link" },
  { value: "note", label: "Note" },
] as const;

/** The dashed "Add" board card (system §6.16) and the dialog it opens: add a web page link or paste a note. */
export function AddKnowledge() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<AddFields>({ kind: "link", url: "", title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);
  const ready = fields.kind === "link" ? fields.url.trim() !== "" : fields.title.trim() !== "" && fields.content.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    try {
      let res: Response;
      try {
        res = await fetch("/api/knowledge-base", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(knowledgePayload(fields)),
        });
      } catch {
        // Network failure: keep the dialog and what was typed so the person can try again.
        toast.error(NETWORK_ERROR);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || "Couldn't add that");
        return;
      }
      toast.success("Added to knowledge");
      setOpen(false);
      setFields({ kind: fields.kind, url: "", title: "", content: "" });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="orbit-transition flex min-h-[148px] w-full flex-col items-start justify-between gap-6 rounded-card-sm border border-dashed border-line-control p-4 text-left text-text-2 hover:border-text-3 hover:bg-line-soft hover:text-text"
        >
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border border-line-3">
            <PlusIcon size={16} />
          </span>
          <span>
            <span className="block text-[14px] font-medium text-text">Add knowledge</span>
            <span className="mt-1 block text-[12px]">A web page or a note Orbit can draw on</span>
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-lg`}>
          <Dialog.Title className={dialogTitleClass}>Add knowledge</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>
            Orbit reads it and draws on it when it writes for this profile.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <Segmented
              label="What to add"
              options={KINDS}
              value={fields.kind}
              onChange={(kind) => setFields({ ...fields, kind })}
              className="self-start"
            />
            {fields.kind === "link" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="knowledge-url">Link</Label>
                <Input
                  id="knowledge-url"
                  type="url"
                  inputMode="url"
                  autoFocus
                  value={fields.url}
                  onChange={(e) => setFields({ ...fields, url: e.target.value })}
                  placeholder="https://"
                />
                <Hint>A public web page: an article, a talk transcript, your own site.</Hint>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="knowledge-title">Title</Label>
                  <Input
                    id="knowledge-title"
                    autoFocus
                    maxLength={100}
                    value={fields.title}
                    onChange={(e) => setFields({ ...fields, title: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="knowledge-text">Text</Label>
                  <textarea
                    id="knowledge-text"
                    rows={7}
                    value={fields.content}
                    onChange={(e) => setFields({ ...fields, content: e.target.value })}
                    aria-describedby="knowledge-text-hint"
                    className={textareaClass}
                  />
                  <Hint id="knowledge-text-hint" aria-live="polite">
                    At least {KNOWLEDGE_MIN_WORDS} words ({wordCount(fields.content)} so far).
                  </Hint>
                </div>
              </>
            )}
            <div className={dialogActionsClass}>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={submitting || !ready}>
                {submitting ? "Adding…" : "Add to knowledge"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** While anything is still indexing, refresh the server list every 4 s (for up to a minute) so pills update. */
export function RefreshWhileIndexing({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 15) clearInterval(id);
    }, 4000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}
