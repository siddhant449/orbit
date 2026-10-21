"use client";

import { QUICK_LINKS } from "@brandloop/agent/client";
import { cn, Pill } from "@brandloop/ui";

/**
 * Follow-ups for the open post (system §6.4 chips, p03/p05): each sends a hidden user message carrying its
 * `quickLinkKey`. The first chip is pre-inverted as the suggested next step. Disabled while a reply runs.
 */
export function QuickLinkChips({
  onPick,
  disabled,
  className,
}: {
  onPick: (key: string, prompt: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Quick actions for this post" className={cn("flex flex-wrap gap-2", className)}>
      {QUICK_LINKS.map((q, i) => (
        <Pill
          key={q.key}
          selected={i === 0}
          aria-pressed={undefined}
          disabled={disabled}
          data-quick-link={q.key}
          onClick={() => onPick(q.key, q.prompt)}
          className="disabled:pointer-events-none disabled:opacity-40"
        >
          {q.label}
        </Pill>
      ))}
    </div>
  );
}
