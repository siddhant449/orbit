"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button, StatusPill, buttonVariants, cn, pillClass } from "@brandloop/ui";
import { authorLine, focusMeta, redraftHref, rowMeta, type QueuePost } from "@/lib/insights/engage-view";
import { Avatar } from "./avatar";

const smallPill = cn(pillClass(), "!min-h-8 text-xs");

/**
 * The focused queue card (p12): accent border, author line, the post excerpt, and an inner "Draft comment · your
 * voice" box. "Open on LinkedIn and paste" copies the draft and opens the post; Orbit never posts the comment.
 */
export function FocusCard({ post, now, onSkip, onPosted }: { post: QueuePost; now: Date; onSkip: () => void; onPosted: () => void }) {
  async function openAndPaste() {
    if (!post.draft) return;
    try {
      await navigator.clipboard.writeText(post.draft);
      toast("Comment copied", { description: "Paste it under the post on LinkedIn." });
    } catch {
      toast("Couldn't copy the comment", { description: "Select the draft and copy it yourself." });
    }
    window.open(post.postUrl, "_blank", "noopener,noreferrer");
    onPosted();
  }

  return (
    <article
      aria-labelledby={`q-${post.id}`}
      className="orbit-panel flex flex-col gap-3.5 !rounded-[20px] !border-[var(--accent-wash-line)] px-5 py-[18px]"
    >
      <div className="flex items-center gap-3">
        <Avatar name={post.author.name} size={36} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={`q-${post.id}`} className="truncate text-sm font-medium text-text">
            {authorLine(post)}
          </h3>
          <span className="text-[11px] text-text-2">{focusMeta(post, now)}</span>
        </div>
        {post.fit === "high" && <StatusPill className="ml-auto">High fit</StatusPill>}
      </div>
      <p className="text-sm leading-[1.55] text-text-soft">{post.excerpt}</p>
      <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-ground px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-accent-text">Draft comment · your voice</span>
          <span className="text-[11px] text-text-3">Edit before you post</span>
        </div>
        {post.draft ? (
          <p className="text-sm leading-normal text-text">{post.draft}</p>
        ) : (
          <p className="text-sm leading-normal text-text-2">No draft yet for this post.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {post.draft ? (
            <>
              <Button size="sm" className="text-xs" onClick={openAndPaste}>
                Open on LinkedIn and paste
              </Button>
              <Link href={redraftHref(post, "angle")} className={smallPill}>
                Another angle
              </Link>
              <Link href={redraftHref(post, "shorter")} className={smallPill}>
                Shorter
              </Link>
            </>
          ) : (
            <Link href={redraftHref(post, "draft")} className={cn(buttonVariants({ size: "sm" }), "text-xs")}>
              Draft a comment
            </Link>
          )}
          <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </div>
    </article>
  );
}

/** A collapsed queue row (p12): avatar, author, two-line excerpt, age and comments, then its status. */
export function QueueRow({ post, now, onFocus }: { post: QueuePost; now: Date; onFocus: () => void }) {
  const done = post.status === "done";
  return (
    <article className="flex items-center gap-3.5 border-b border-line px-2 py-4">
      <Avatar name={post.author.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <h3 className="text-sm font-medium text-text">
          {done ? (
            authorLine(post)
          ) : (
            <button type="button" onClick={onFocus} className="cursor-pointer text-left hover:underline hover:underline-offset-4">
              {authorLine(post)}
            </button>
          )}
        </h3>
        <p className="line-clamp-2 text-xs leading-[1.45] text-text-2">{post.excerpt}</p>
      </div>
      <span className="whitespace-nowrap text-[11px] text-text-3 max-sm:hidden">{rowMeta(post, now)}</span>
      {done ? (
        <span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-pill bg-line-soft px-2.5 text-[11px] text-text-2">Done</span>
      ) : post.draft ? (
        <span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-pill border border-line-3 px-2.5 text-[11px] font-medium text-text">
          Draft ready
        </span>
      ) : null}
    </article>
  );
}
