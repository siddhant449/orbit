"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Button, Hint, Label, NativeSelect } from "@brandloop/ui";
import {
  dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass, textareaClass,
} from "@/components/dialog-classes";
import {
  attachVisual, createVisual, decideTheme, getCredits, pollVisual, VisualsApiError, type ThemeColoursDto, type VisualAspect, type VisualDto, type VisualType,
} from "@/lib/visuals-api";

const TYPES: { value: VisualType; label: string }[] = [
  { value: "INFOGRAPHIC", label: "Infographic" },
  { value: "BEFORE_AFTER", label: "Before and after" },
  { value: "QUOTE", label: "Quote card" },
  { value: "GENERAL", label: "Other image" },
];
const ASPECTS: { value: VisualAspect; label: string }[] = [
  { value: "PORTRAIT_4_5", label: "Portrait 4:5" },
  { value: "SQUARE", label: "Square" },
  { value: "LANDSCAPE_3_2", label: "Landscape 3:2" },
  { value: "PORTRAIT_2_3", label: "Tall 2:3" },
];

type Phase =
  | { kind: "form" }
  | { kind: "making" }
  | { kind: "brand"; proposal: ThemeColoursDto }
  | { kind: "slow" }
  | { kind: "failed"; message: string };

/**
 * "Add a visual" for one post: describe the image, make it (1 credit), then attach it to the post. Mirrors the chat
 * card's flow on the same routes; the person's click on "Make image" is the only thing that spends a credit.
 */
export function AddVisualDialog({ documentId, open, onOpenChange, onAttached }: { documentId: string; open: boolean; onOpenChange: (open: boolean) => void; onAttached: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState<VisualType>("INFOGRAPHIC");
  const [aspect, setAspect] = useState<VisualAspect>("PORTRAIT_4_5");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [balance, setBalance] = useState<number | null>(null);
  const requestId = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    void getCredits().then((c) => alive.current && setBalance(c.balance), () => {});
  }, [open]);

  async function make(useBrandColours = true) {
    setPhase({ kind: "making" });
    requestId.current ??= crypto.randomUUID();
    try {
      const created = await createVisual({ documentId, prompt, visualType: type, aspect, useBrandColours, requestId: requestId.current });
      const { visual, timedOut }: { visual: VisualDto; timedOut: boolean } = await pollVisual(created.visual.id);
      if (!alive.current) return;
      if (timedOut) return setPhase({ kind: "slow" });
      requestId.current = null;
      if (visual.status === "FAILED") return setPhase({ kind: "failed", message: visual.error ?? "That image couldn't be made. Your credit was returned." });
      await attachVisual(visual.id, documentId);
      if (!alive.current) return;
      setBalance(created.balance);
      setPrompt("");
      onAttached();
      onOpenChange(false);
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof VisualsApiError) {
        if (err.code === "needs_brand_confirmation") return setPhase({ kind: "brand", proposal: err.details.proposal as ThemeColoursDto });
        if (err.code === "out_of_credits") return setPhase({ kind: "failed", message: "You're out of image credits for now." });
        requestId.current = null;
        return setPhase({ kind: "failed", message: err.message });
      }
      setPhase({ kind: "failed", message: "Couldn't reach Orbit. Check your connection and try again." });
    }
  }

  async function decide(accept: boolean, proposal: ThemeColoursDto) {
    try {
      await decideTheme(accept, accept ? proposal : undefined);
      await make(accept);
    } catch {
      setPhase({ kind: "failed", message: "Couldn't save your colours. Try again." });
    }
  }

  const busy = phase.kind === "making";
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-[520px]`} data-add-visual>
          <Dialog.Title className={dialogTitleClass}>Add a visual</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>
            Describe the image for this post. It uses 1 image credit{balance !== null ? `, and you have ${balance}` : ""}.
          </Dialog.Description>

          {phase.kind === "brand" ? (
            <div className="mt-5 flex flex-col gap-3" data-brand-confirm>
              <p className="text-[14px]">Use your brand colours for images?</p>
              <span className="flex gap-1" aria-hidden="true">
                {(["background", "accent", "headline", "bodyText", "bar"] as const).map((r) => (
                  <span key={r} className="size-6 rounded-full border border-line-4" style={{ background: phase.proposal[r] }} />
                ))}
              </span>
              <div className={dialogActionsClass}>
                <Button variant="ghost" onClick={() => void decide(false, phase.proposal)}>Skip colours</Button>
                <Button onClick={() => void decide(true, phase.proposal)}>Use these colours</Button>
              </div>
            </div>
          ) : (
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (prompt.trim() && !busy) void make();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="visual-prompt">What should the image show?</Label>
                <textarea id="visual-prompt" className={textareaClass} rows={4} maxLength={2000} value={prompt} disabled={busy} onChange={(e) => setPrompt(e.target.value)} placeholder="Three habits that made our hiring faster, as a numbered list" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="visual-type">Style</Label>
                  <NativeSelect id="visual-type" value={type} disabled={busy} onChange={(e) => setType(e.target.value as VisualType)}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="visual-aspect">Shape</Label>
                  <NativeSelect id="visual-aspect" value={aspect} disabled={busy} onChange={(e) => setAspect(e.target.value as VisualAspect)}>
                    {ASPECTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </NativeSelect>
                </div>
              </div>
              {phase.kind === "failed" && <p role="alert" className="text-[13px] text-text-2">{phase.message}</p>}
              {phase.kind === "slow" && <Hint>Still working. It will be in your image library when it&apos;s ready.</Hint>}
              <div className={dialogActionsClass}>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
                  {phase.kind === "slow" ? "Close" : "Cancel"}
                </Button>
                <Button type="submit" disabled={busy || !prompt.trim() || phase.kind === "slow"}>
                  {busy ? "Making your image…" : "Make image · 1 credit"}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
