"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@brandloop/ui";
import { CheckIcon } from "@brandloop/ui/icons";

/**
 * "Mark as posted" in the editor header. It only records that the writer posted this themselves (`postedAt`); nothing is
 * published. Posted shows as "Posted" with an undo. Challenge, goals and badges count from this.
 */
export function MarkPosted({ documentId, initialPostedAt }: { documentId: string; initialPostedAt: string | null }) {
  const [postedAt, setPostedAt] = useState(initialPostedAt);
  const [busy, setBusy] = useState(false);
  const { mutate } = useSWRConfig();

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !postedAt;
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/posted`, { method: next ? "POST" : "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; postedAt?: string | null };
      if (!res.ok) throw new Error(body.error ?? "Couldn't update this post. Try again.");
      setPostedAt(body.postedAt ?? null);
      // The sidebar card, the bell and Activities read from what this changed.
      void mutate((key) => typeof key === "string" && (key.startsWith("/api/challenge") || key.startsWith("/api/notifications") || key.startsWith("/api/goals")));
      if (next) toast.success("Marked as posted. It counts toward your goals.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update this post. Try again.");
    }
    setBusy(false);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={busy}
      onClick={() => void toggle()}
      aria-pressed={Boolean(postedAt)}
      data-mark-posted={postedAt ? "posted" : "open"}
      title={postedAt ? "Marked as posted by you. Click to undo." : "Record that you posted this yourself. Nothing is published."}
    >
      {postedAt ? (
        <>
          <CheckIcon aria-hidden="true" />
          Posted (undo)
        </>
      ) : (
        "Mark as posted"
      )}
    </Button>
  );
}
