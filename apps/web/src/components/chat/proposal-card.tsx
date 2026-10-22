"use client";

import { useState } from "react";
import { toast } from "sonner";
import { proposalStatus, type Proposal } from "@brandloop/agent/client";
import { Button, cn } from "@brandloop/ui";
import { useDocumentPanel } from "./document-panel";
import { useThreadPlace } from "./thread-context";

/** The chat the thread belongs to. A proposal only exists after the first reply, when the address is `/chat/:id`. */
function currentChatId(): string | null {
  const m = /^\/chat\/([^/?#]+)/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

type Local =
  | { kind: "idle" }
  | { kind: "applying" }
  | { kind: "applied"; version: number }
  | { kind: "already" }
  | { kind: "stale" }
  | { kind: "gone" };

/**
 * An edit proposal in the thread (design §9; Orbit p05 "Replacing this passage"): the passage as the post has it,
 * marked and struck through, then the replacement on the post's paper. Apply writes it through the apply route, which
 * takes only ids and the version seen; the text shown here is never sent. Dismiss is local. Text renders as text.
 */
export function ProposalCard({ proposal, toolCallId }: { proposal: Proposal; toolCallId: string }) {
  const ctl = useDocumentPanel();
  const place = useThreadPlace();
  const [local, setLocal] = useState<Local>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);

  const doc = ctl?.state.doc ?? null;
  // Which proposals saved versions record, from the panel's version list (null while it loads). A failed list falls
  // back to the text, and Apply still can't double-apply: the server answers already_applied.
  const versions = ctl?.versions ?? null;
  const sameDoc = doc?.id === proposal.documentId;
  const appliedIds = !sameDoc ? null : ctl?.versionsError ? [] : versions ? versions.flatMap((v) => (v.proposalId ? [v.proposalId] : [])) : null;
  const fromDoc = proposalStatus({ ...proposal, proposalId: toolCallId }, doc, appliedIds);
  const status =
    local.kind === "applied" || local.kind === "already" ? "applied" : local.kind === "stale" || local.kind === "gone" ? "stale" : fromDoc;
  const streaming = Boolean(ctl && (ctl.state.creating || ctl.state.updating));
  const busy = local.kind === "applying" || streaming || Boolean(ctl?.saving);

  async function apply() {
    const chatId = place?.chatId ?? currentChatId();
    if (!chatId) {
      toast("Open this chat to apply the suggestion.");
      return;
    }
    const expectedVersion = doc && doc.id === proposal.documentId && doc.version > 0 ? doc.version : proposal.documentVersion;
    setLocal({ kind: "applying" });
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(proposal.documentId)}/apply-proposal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, toolCallId, expectedVersion }),
      });
      const body = (await res.json().catch(() => null)) as { code?: string; id?: string; title?: string; version?: number; text?: string } | null;
      if (res.ok && body && typeof body.version === "number") {
        ctl?.onData({ type: "data-document", data: { id: body.id, title: body.title, version: body.version, text: body.text } });
        setLocal({ kind: "applied", version: body.version });
        toast(`Applied as version ${body.version}.`);
        return;
      }
      if (res.status === 409 && body?.code === "already_applied") {
        setLocal({ kind: "already" });
        ctl?.retryVersions();
        return;
      }
      if (res.status === 409 && body?.code === "stale_passage") {
        setLocal({ kind: "stale" });
        return;
      }
      if (res.status === 409) {
        await ctl?.refetch();
        setLocal({ kind: "idle" });
        toast("This post changed. Reloaded the latest version; check the suggestion and apply it again.");
        return;
      }
      if (res.status === 404) {
        setLocal({ kind: "gone" });
        return;
      }
      setLocal({ kind: "idle" });
      toast("The suggestion couldn't be applied. Try again.");
    } catch {
      setLocal({ kind: "idle" });
      toast("The suggestion couldn't be applied. Check your connection and try again.");
    }
  }

  if (dismissed) {
    return (
      <div data-proposal-card="dismissed" className="my-2 flex items-center gap-2 text-[13px] text-text-3">
        <span>Suggestion dismissed.</span>
        <Button variant="ghost" size="sm" className="h-7 px-2.5" onClick={() => setDismissed(false)}>
          Show it
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Suggested edit" data-proposal-card={status} className="my-2 flex flex-col gap-4 rounded-card border border-line bg-panel p-5">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-text-2">Replacing this passage</p>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.5]">
          <span className="sr-only">Current text: </span>
          <del
            data-proposal-target
            className={cn(
              "box-decoration-clone rounded-[3px] px-0.5 text-text decoration-text-2 decoration-1",
              status === "ready" ? "bg-selection-mark" : "text-text-3",
            )}
          >
            {proposal.targetText}
          </del>
        </p>
      </div>

      <div className="light overflow-hidden rounded-card-sm bg-panel px-[18px] py-3.5 text-text shadow-elevation-draft">
        <span className="sr-only">Suggested text: </span>
        {proposal.replacement ? (
          <ins data-proposal-replacement className="whitespace-pre-wrap break-words text-[15px] leading-[1.5] no-underline">
            {proposal.replacement}
          </ins>
        ) : (
          <p className="text-[15px] text-text-3">Remove the passage.</p>
        )}
      </div>

      <div className="flex min-h-8 flex-wrap items-center gap-2" aria-live="polite">
        {status === "ready" && (
          <>
            <Button size="sm" onClick={() => void apply()} disabled={busy}>
              {local.kind === "applying" ? "Applying…" : "Apply"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} disabled={local.kind === "applying"}>
              Dismiss
            </Button>
          </>
        )}
        {status === "applied" && (
          <p className="flex items-center gap-2 text-[13px] text-text-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent-text" />
            {local.kind === "applied" ? `Applied as version ${local.version}.` : "Applied to the post."}
          </p>
        )}
        {status === "stale" && (
          <p className="text-[13px] text-text-2">
            {local.kind === "gone"
              ? "This suggestion isn't available any more."
              : "That passage isn't in the post any more, so this suggestion can't be applied. Ask for a new one."}
          </p>
        )}
      </div>
    </section>
  );
}
