"use client";

import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import type { EditVisualOutput, ProposeVisualOutput, SuggestVisualsOutput } from "@brandloop/agent";
import { Button, cn } from "@brandloop/ui";
import { postMediaKey } from "@/components/editor/post-image";
import {
  attachVisual, createVisual, decideTheme, pollVisual, VisualsApiError, type ThemeColoursDto, type VisualAspect, type VisualDto, type VisualType,
} from "@/lib/visuals-api";

/**
 * Image cards in the thread (design F5 §8): idea cards from suggestVisuals, a single prompt card from proposeVisual, and
 * the status of an edit. Reading and editing a prompt is free; the one thing that spends a credit is the person's click on
 * "Make image", which calls POST /api/visuals. The UI track restyles these; they use the Orbit primitives for now.
 */

const TYPE_TO_API: Record<string, VisualType> = { infographic: "INFOGRAPHIC", before_after: "BEFORE_AFTER", quote: "QUOTE", general: "GENERAL" };
const TYPE_LABEL: Record<string, string> = { infographic: "Infographic", before_after: "Before and after", quote: "Quote", general: "Image" };

type Phase =
  | { kind: "idle" }
  | { kind: "making" }
  | { kind: "needs-brand"; proposal: ThemeColoursDto }
  | { kind: "done"; visual: VisualDto; balance: number | null; attached: boolean }
  | { kind: "failed"; message: string }
  | { kind: "slow"; visual: VisualDto };

const SWATCH_ROLES = ["background", "accent", "headline", "bodyText", "bar", "highlightBar"] as const;

function Swatches({ colours }: { colours: ThemeColoursDto }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {SWATCH_ROLES.map((r) => (
        <span key={r} className="size-5 rounded-full border border-line-4" style={{ background: colours[r] }} />
      ))}
    </span>
  );
}

/** One image to make: an editable prompt, the 1-credit button, and everything that can come back from the routes. */
function MakeImage({ documentId, type, aspect, initialPrompt, startOpen }: { documentId: string; type: string; aspect: string; initialPrompt: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // One request id per click-through, reused if the same make is retried, so a retry never spends a second credit.
  const requestId = useRef<string | null>(null);
  const alive = useRef(true);
  // Set on every mount: React's dev double-mount runs the cleanup once before the real mount.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function make(useBrandColours = true) {
    setPhase({ kind: "making" });
    requestId.current ??= crypto.randomUUID();
    try {
      const created = await createVisual({
        documentId,
        prompt,
        visualType: TYPE_TO_API[type] ?? "GENERAL",
        aspect: aspect as VisualAspect,
        useBrandColours,
        requestId: requestId.current,
      });
      const { visual, timedOut } = await pollVisual(created.visual.id);
      if (!alive.current) return;
      if (timedOut) return setPhase({ kind: "slow", visual });
      if (visual.status === "FAILED") {
        requestId.current = null; // a failed make was refunded; a new click is a new request
        return setPhase({ kind: "failed", message: visual.error ?? "That image couldn't be made. Your credit was returned." });
      }
      // The image belongs to this post: put it there so it shows up in the editor.
      let attached = false;
      try {
        await attachVisual(visual.id, documentId);
        attached = true;
        void mutate(postMediaKey(documentId)); // an open editor shows the new image
      } catch {
        attached = false;
      }
      requestId.current = null;
      if (alive.current) setPhase({ kind: "done", visual, balance: created.balance, attached });
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof VisualsApiError) {
        if (err.code === "needs_brand_confirmation") {
          const proposal = (err.details.proposal ?? null) as (ThemeColoursDto & Record<string, unknown>) | null;
          return setPhase({ kind: "needs-brand", proposal: proposal as ThemeColoursDto });
        }
        if (err.code === "out_of_credits") {
          const when = typeof err.details.refillsAt === "string" ? new Date(err.details.refillsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : null;
          return setPhase({ kind: "failed", message: when ? `You're out of image credits. They refill on ${when}.` : "You're out of image credits for now." });
        }
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
    <div className="flex flex-col gap-3">
      {open && (
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          Prompt (editing it is free)
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={2000}
            rows={4}
            disabled={busy}
            className="rounded-card-sm border border-line-control bg-ground px-3 py-2.5 text-[14px] leading-[1.5] text-text focus-visible:outline-2 focus-visible:outline-accent-text"
          />
        </label>
      )}

      {(phase.kind === "idle" || phase.kind === "failed" || phase.kind === "making") && (
        <div className="flex flex-wrap items-center gap-2">
          {!open && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              Review prompt
            </Button>
          )}
          <Button size="sm" onClick={() => void make()} disabled={busy || !prompt.trim()}>
            {busy ? "Making your image…" : "Make image · 1 credit"}
          </Button>
        </div>
      )}

      {phase.kind === "needs-brand" && (
        <div className="flex flex-col gap-2.5 rounded-card-sm border border-line p-3.5" data-brand-confirm>
          <p className="text-[14px]">Use these brand colours for your images?</p>
          <Swatches colours={phase.proposal} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void decide(true, phase.proposal)}>
              Use these colours
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void decide(false, phase.proposal)}>
              Skip colours
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "failed" && (
        <p role="alert" className="text-[13px] text-text-2">
          {phase.message}
        </p>
      )}
      {phase.kind === "slow" && <p className="text-[13px] text-text-2">Still working. It will be in your library when it&apos;s ready.</p>}

      {phase.kind === "done" && (
        <figure className="flex flex-col gap-2" data-visual-result={phase.visual.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={phase.visual.imageUrl ?? ""} alt={phase.visual.altText ?? "The image made for your post"} className="w-full max-w-[320px] rounded-card-sm border border-line" />
          <figcaption className="text-[13px] text-text-2">
            {phase.attached ? "Added to your post." : "Made. Find it in your library."}
            {phase.balance !== null ? ` ${phase.balance} credits left.` : ""} Ask me to change it, for example &ldquo;make the background navy&rdquo;.
          </figcaption>
        </figure>
      )}
    </div>
  );
}

export function VisualConceptCards({ output }: { output: SuggestVisualsOutput }) {
  return (
    <section aria-label="Image ideas" data-visual-concepts className="my-2 grid gap-3">
      {output.concepts.map((c) => (
        <article key={c.index} className={cn("flex flex-col gap-3 rounded-card border border-line bg-panel p-5")} data-visual-concept={c.index}>
          <header className="flex flex-col gap-1">
            <p className="text-[12px] uppercase tracking-wide text-text-3">{TYPE_LABEL[c.type] ?? "Image"}</p>
            <h3 className="text-[16px] font-medium">{c.name}</h3>
            <p className="text-[14px] text-text-soft">{c.description}</p>
            <p className="text-[13px] text-text-2">{c.whyItWorks}</p>
          </header>
          <MakeImage documentId={output.documentId} type={c.type} aspect="PORTRAIT_4_5" initialPrompt={c.prompt} startOpen={false} />
        </article>
      ))}
    </section>
  );
}

export function VisualProposalCard({ output }: { output: ProposeVisualOutput }) {
  return (
    <section aria-label="Image to make" data-visual-proposal className="my-2 flex flex-col gap-3 rounded-card border border-line bg-panel p-5">
      <p className="text-[12px] uppercase tracking-wide text-text-3">{TYPE_LABEL[output.type] ?? "Image"}</p>
      <MakeImage documentId={output.documentId} type={output.type} aspect={output.aspect} initialPrompt={output.prompt} startOpen />
    </section>
  );
}

/** The edit the agent started: polls the image until the new version is ready, then shows it. */
export function VisualEditStatus({ output }: { output: EditVisualOutput }) {
  const [state, setState] = useState<{ kind: "working" } | { kind: "done"; visual: VisualDto } | { kind: "error"; message: string }>({ kind: "working" });
  useEffect(() => {
    const ac = new AbortController();
    pollVisual(output.visualId, { signal: ac.signal, intervalMs: 1_500 })
      .then(({ visual }) => {
        if (ac.signal.aborted) return;
        setState(visual.error ? { kind: "error", message: visual.error } : { kind: "done", visual });
      })
      .catch(() => !ac.signal.aborted && setState({ kind: "error", message: "Couldn't check on the edit." }));
    return () => ac.abort();
  }, [output.visualId]);
  return (
    <section aria-label="Image edit" data-visual-edit className="my-2 flex flex-col gap-2 rounded-card border border-line bg-panel p-5" aria-live="polite">
      {state.kind === "working" && <p className="text-[14px] text-text-2">Editing the image…</p>}
      {state.kind === "error" && <p className="text-[14px] text-text-2">{state.message}</p>}
      {state.kind === "done" && (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.visual.imageUrl ?? ""} alt={state.visual.altText ?? "The edited image"} className="w-full max-w-[320px] rounded-card-sm border border-line" />
          <figcaption className="text-[13px] text-text-2">
            Updated. {state.visual.remainingEdits} edit{state.visual.remainingEdits === 1 ? "" : "s"} left.
          </figcaption>
        </figure>
      )}
    </section>
  );
}
