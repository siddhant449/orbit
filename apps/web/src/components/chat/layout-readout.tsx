import { measurePost, type PostMetrics } from "@brandloop/agent/client";
import { cn } from "@brandloop/ui";

export type ReadoutChip = { key: string; label: string; ok: boolean };

/** What the phone layout of a post says, in plain words. Pure so it can be unit-tested. */
export function readoutChips(m: PostMetrics): ReadoutChip[] {
  if (m.blocks === 0) return [];
  const chips: ReadoutChip[] = [
    { key: "hook", label: `Hook · ${m.hookMobileLines} ${m.hookMobileLines === 1 ? "line" : "lines"} on mobile`, ok: m.hookMobileLines <= 2 },
    { key: "blocks", label: `${m.blocks} ${m.blocks === 1 ? "block" : "blocks"}`, ok: true },
  ];
  if (m.bulletLists + m.numberedLists > 0) chips.push({ key: "list", label: "List", ok: true });
  chips.push(
    m.promiseBeforeFold
      ? { key: "fold", label: "Fits before see more", ok: true }
      : { key: "fold", label: "Promise is after the fold", ok: false },
  );
  return chips;
}

/** The post's phone layout under the preview (design §4.4): computed from the text, no model involved. */
export function LayoutReadout({ text, className }: { text: string; className?: string }) {
  const chips = readoutChips(measurePost(text));
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Post layout" data-layout-readout className={cn("flex flex-wrap gap-2", className)}>
      {chips.map((c) => (
        <span
          key={c.key}
          data-chip={c.key}
          data-ok={c.ok}
          className={cn(
            "inline-flex h-7 items-center rounded-pill border px-3 text-[12px] font-medium",
            c.ok ? "border-line-3 text-text-2" : "border-accent-text text-accent-text",
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
