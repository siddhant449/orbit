"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { Button, cn } from "@brandloop/ui";
import { CheckIcon, CopyIcon } from "@brandloop/ui/icons";
import { AssistantAvatar } from "./assistant-avatar";
import { hasVisibleParts, MessageParts, replyText } from "./message-parts";
import { messageKeys, waitingKey } from "./reply-keys";

type Status = "submitted" | "streaming" | "ready" | "error";

/** What the user wrote: a right-aligned bubble (screens.md B2). A message sent here rises in once. */
const UserBubble = memo(function UserBubble({ message, arrive }: { message: ChatUIMessage; arrive: boolean }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  return (
    <div data-message="user" className="flex justify-end">
      <div className={cn("user-bubble", arrive && "msg-arrive")}>
        <span className="sr-only">You: </span>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
});

/** Before the first word: three accent dots and a softly lit "Thinking". */
function Thinking() {
  return (
    <div className="flex h-[23px] items-center gap-2.5 text-[13px]" data-thinking="">
      <span aria-hidden="true" className="thinking-dots">
        <span />
        <span />
        <span />
      </span>
      <span className="thinking-label">Thinking</span>
    </div>
  );
}

/** Copy under a finished reply; shown on hover and focus (always on touch). */
function ReplyActions({ message }: { message: ChatUIMessage }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(replyText(message));
      setCopied(true);
      toast("Reply copied");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Couldn't copy the reply. Select the text and copy it instead.");
    }
  }
  return (
    <div className="reply-actions -mb-5 -ml-1.5 -mt-1.5 flex items-center gap-1">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy reply"
        title="Copy reply"
        className="orbit-transition grid size-8 place-items-center rounded-full text-text-3 hover:bg-panel-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      >
        {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
      </button>
    </div>
  );
}

/**
 * A reply: the Orbit mark, then the prose, steps and cards in one column. Memoised: while one reply streams, the
 * finished ones above it (same message objects from `useChat`) don't re-render or re-parse their markdown.
 */
const Reply = memo(function Reply({
  message,
  live,
  arrive,
  footer,
}: {
  message?: ChatUIMessage;
  live: boolean;
  arrive?: boolean;
  footer?: ReactNode;
}) {
  const shown = message ? hasVisibleParts(message) : false;
  const copyable = Boolean(message && !live && replyText(message));
  return (
    <div data-message="assistant" data-live={live ? "" : undefined} className={cn("flex items-start gap-3 sm:gap-4", arrive && "msg-arrive")}>
      <AssistantAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5">
        <span className="sr-only">Orbit: </span>
        {live && !shown && <Thinking />}
        {message && <MessageParts message={message} streaming={live} />}
        {footer}
        {copyable && <ReplyActions message={message!} />}
      </div>
    </div>
  );
});

/** A failed send or an ended recovery, in the reply column: what happened, and the way forward. */
function Notice({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 pl-10 sm:pl-11">
      <p className="text-[14px] leading-[1.5] text-danger">{text}</p>
      {action}
    </div>
  );
}

export function MessageList({
  messages,
  status,
  initialIds,
  errorText,
  onRetry,
  notice,
  followUps,
}: {
  messages: ChatUIMessage[];
  status: Status;
  initialIds: ReadonlySet<string>;
  errorText: string | null;
  /** Absent when the refused text went back to the composer. */
  onRetry?: () => void;
  /** Recovery ended without a reply to show, or Stop failed. */
  notice?: { text: string; reload?: boolean } | null;
  /** Follow-up chips under the newest finished reply (the post's quick links). */
  followUps?: ReactNode;
}) {
  const shown = messages.filter((m) => !m.metadata?.hideInUI);
  // Live and waiting read the full list: a hidden quick-link message still starts a turn.
  const last = messages.at(-1);
  const busy = status === "submitted" || status === "streaming";
  // Waiting on the first chunk: the reply's place, thinking.
  const waiting = busy && last?.role === "user";
  const lastShown = shown.at(-1);
  // The thinking row and the reply that follows it share a key, so the row turns into the reply in place.
  const keys = useMemo(() => messageKeys(messages), [messages]);
  return (
    <ol className="flex flex-col gap-7" aria-label="Messages">
      {/* One array, so the thinking row and its reply (same key) are reconciled as one element. */}
      {[
        ...shown.map((m) => (
          <li key={keys.get(m.id) ?? m.id}>
            {m.role === "user" ? (
              <UserBubble message={m} arrive={!initialIds.has(m.id)} />
            ) : (
              <Reply
                message={m}
                live={busy && m.id === last?.id}
                arrive={!initialIds.has(m.id)}
                footer={!busy && m.id === lastShown?.id ? followUps : undefined}
              />
            )}
          </li>
        )),
        ...(waiting
          ? [
              <li key={waitingKey(messages) ?? "waiting"}>
                <Reply live arrive />
              </li>,
            ]
          : []),
      ]}
      {errorText && !busy && (
        <li>
          <Notice
            text={errorText}
            action={
              onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              )
            }
          />
        </li>
      )}
      {notice && !busy && (
        <li>
          <Notice
            text={notice.text}
            action={
              notice.reload && (
                <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              )
            }
          />
        </li>
      )}
    </ol>
  );
}
