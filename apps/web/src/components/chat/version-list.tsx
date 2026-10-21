"use client";

import { Button, cn } from "@brandloop/ui";
import type { VersionRow } from "./use-document";

const SOURCE: Record<string, string> = {
  AI_CREATE: "Written by Orbit",
  AI_EDIT: "Edited by Orbit",
  USER_EDIT: "Your edit",
  RESTORE: "Restored",
};

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

/** "just now", "4 minutes ago", "yesterday", then a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  if (!rtf || Number.isNaN(s)) return "";
  if (a < 45) return "just now";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 7 * 86_400) return rtf.format(Math.round(s / 86_400), "day");
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

/**
 * Every saved version, newest first (Task 8 history). The current one is marked; any other can be restored, which
 * writes a new version (history is never rewritten).
 */
export function VersionList({
  versions,
  current,
  error,
  busy,
  onRestore,
  onRetry,
}: {
  versions: VersionRow[] | null;
  current: number;
  error: boolean;
  busy: boolean;
  onRestore: (version: number) => void;
  onRetry: () => void;
}) {
  if (error)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="type-ui text-danger">The versions couldn&apos;t be loaded.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  if (!versions) return <p className="type-ui text-text-2">Loading versions…</p>;
  return (
    <ol aria-label="Versions" className="flex flex-col">
      {versions.map((v) => {
        const isCurrent = v.version === current;
        return (
          <li
            key={v.version}
            data-version={v.version}
            className={cn(
              "flex items-center gap-4 border-b border-line py-3.5 last:border-b-0",
              isCurrent && "relative before:absolute before:-left-3 before:top-1/2 before:size-1.5 before:-translate-y-1/2 before:rounded-full before:bg-accent-text",
            )}
          >
            <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-text-2">v{v.version}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                {SOURCE[v.source] ?? "Saved"}
                {isCurrent && <span className="ml-2 text-xs font-normal text-accent-text">Current</span>}
              </p>
              <p className="truncate text-xs text-text-3">
                {[relativeTime(v.createdAt), `${v.chars.toLocaleString("en-US")} characters`, v.changeSummary]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {!isCurrent && (
              <Button
                variant="micro"
                size="sm"
                disabled={busy}
                onClick={() => onRestore(v.version)}
                aria-label={`Restore version ${v.version}`}
              >
                Restore
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
