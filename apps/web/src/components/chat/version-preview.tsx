"use client";

import { useCallback, useState } from "react";
import { Button } from "@brandloop/ui";
import { stripCitations } from "@brandloop/agent/client";

export type VersionPreview = { version: number; text: string };

/** Read-only preview of an old version: fetched on demand, never written back. */
export function useVersionPreview(documentId: string | null) {
  const [preview, setPreview] = useState<VersionPreview | null>(null);
  const [error, setError] = useState(false);
  const open = useCallback(
    async (version: number) => {
      if (!documentId) return;
      setError(false);
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/versions/${version}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const d = (await res.json()) as { version: number; text: string };
        setPreview({ version: d.version, text: stripCitations(d.text) });
      } catch {
        setError(true);
      }
    },
    [documentId],
  );
  const close = useCallback(() => setPreview(null), []);
  return { preview, error, open, close };
}

/** "Viewing v2" bar: restore it (moves the current pointer) or go back to the current text. */
export function VersionPreviewBar({
  version,
  busy,
  onRestore,
  onBack,
}: {
  version: number;
  busy: boolean;
  onRestore: () => void;
  onBack: () => void;
}) {
  return (
    <div role="status" data-version-preview-bar className="flex flex-wrap items-center justify-between gap-3 rounded-card-sm border border-accent-text/40 bg-accent-wash px-4 py-2.5 text-[13px]">
      <span className="text-text">Viewing v{version}, read only</span>
      <span className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back to current
        </Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={onRestore}>
          Restore this version
        </Button>
      </span>
    </div>
  );
}
