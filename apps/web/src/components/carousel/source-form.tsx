"use client";

import { useId, useState } from "react";
import { Dialog } from "radix-ui";
import { Sparkles } from "lucide-react";
import { Button, Label } from "@brandloop/ui";
import { CloseIcon } from "@brandloop/ui/icons";
import { dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass, textareaClass } from "@/components/dialog-classes";

export type SourcePost = { id: string; title: string; text: string };

const MIN = 20;
const MAX = 6000;

/** The post or topic the slides come from. Submitting calls the generator; the error comes back from the parent. */
export function SourceForm({
  initial,
  busy,
  error,
  submitLabel,
  onSubmit,
}: {
  initial: string;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (text: string) => Promise<boolean> | void;
}) {
  const id = useId();
  const [text, setText] = useState(initial);
  const short = text.trim().length < MIN;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!short && !busy) void onSubmit(text.trim());
      }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`${id}-source`}>Post or topic</Label>
          <span className="text-[12px] tabular-nums text-text-3">
            {text.length.toLocaleString("en-US")} / {MAX.toLocaleString("en-US")}
          </span>
        </div>
        <textarea
          id={`${id}-source`}
          value={text}
          maxLength={MAX}
          rows={6}
          placeholder="Paste your post, or describe what the carousel should teach."
          onChange={(e) => setText(e.target.value)}
          className={textareaClass}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] leading-[1.5] text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={short || busy} aria-busy={busy}>
          <Sparkles aria-hidden="true" />
          {busy ? "Writing slides…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function GenerateDialog({
  open,
  onOpenChange,
  initial,
  replacing,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  replacing: number;
  busy: boolean;
  error: string | null;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-[560px]`}>
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className={dialogTitleClass}>Generate slides from a post</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="size-9 border border-line-3" aria-label="Close">
                <CloseIcon />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={dialogDescriptionClass}>
            {replacing > 0
              ? `Orbit replaces your ${replacing} ${replacing === 1 ? "slide" : "slides"} with new ones. You can undo it right after.`
              : "Orbit writes 5 to 8 slides in your voice. You can edit every word after."}
          </Dialog.Description>
          <div className="mt-5">
            <SourceForm initial={initial} busy={busy} error={error} submitLabel="Generate slides" onSubmit={onSubmit} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
