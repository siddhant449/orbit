"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@brandloop/ui";
import { replyHref } from "@/lib/insights/engage-view";

/**
 * Works today, without LinkedIn: paste a comment someone left and Orbit opens a new chat with a reply prompt in the
 * composer (not sent), so the reply is drafted in the user's voice and they post it themselves.
 */
export function ReplyDrafter() {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const href = replyHref(text);

  return (
    <section aria-labelledby={`${id}-h`} className="orbit-panel flex flex-col gap-3 !rounded-[20px] p-5">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-h`} className="text-sm font-medium text-text">
          Draft a reply
        </h2>
        <p className="text-[13px] leading-[1.5] text-text-2">
          Paste a comment from one of your posts. Orbit opens a chat with it and drafts a reply in your voice.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (href) router.push(href);
        }}
      >
        <label htmlFor={`${id}-text`} className="sr-only">
          Comment to reply to
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Paste the comment here"
          className="orbit-transition min-h-[88px] w-full resize-y rounded-[14px] border border-line-control bg-ground px-3.5 py-3 text-sm leading-normal text-text placeholder:text-text-3 focus-visible:border-accent-text focus-visible:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-3">You post the reply yourself.</span>
          <Button type="submit" size="sm" className="text-xs" disabled={!href}>
            Draft a reply
          </Button>
        </div>
      </form>
    </section>
  );
}
