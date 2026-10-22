"use client";

import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@brandloop/ui";
import { ChevronUpIcon } from "@brandloop/ui/icons";

/** Where a post opens today: its chat (the post panel lives there). `/posts/<id>` replaces this when the editor ships. */
export const postHref = (chatId: string) => `/chat/${chatId}`;

/** Ghost control pill (p08 "All labels", p15 "Today"): `line-control` outline per A17. */
export const ghostPill =
  "orbit-transition inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border border-line-control px-3.5 text-[13px] text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse";

/** "All labels": labels don't exist yet, so the pill stays visibly off and says so when pressed. */
export function LabelsPill({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-describedby="labels-note"
      onClick={() => toast("Labels aren't available yet", { description: "Colour-coded labels for posts arrive in a later release." })}
      className={cn(ghostPill, "cursor-not-allowed opacity-60 hover:border-line-control hover:bg-transparent hover:text-text", className)}
    >
      All labels
      <ChevronUpIcon size={12} className="rotate-180" />
      <span id="labels-note" className="sr-only">
        Labels arrive in a later release.
      </span>
    </button>
  );
}

export function NewPostLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "orbit-transition inline-flex min-h-10 shrink-0 items-center rounded-pill bg-accent px-[18px] text-[13px] font-medium text-on-accent hover:bg-accent-hover hover:shadow-glow motion-safe:hover:-translate-y-px",
        className,
      )}
    >
      New post
    </Link>
  );
}
