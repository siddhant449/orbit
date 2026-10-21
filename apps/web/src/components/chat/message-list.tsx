"use client";

import { RotateCcw } from "lucide-react";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { Button, cn } from "@brandloop/ui";
import { MessageParts, wordCount } from "./message-parts";

type Status = "submitted" | "streaming" | "ready" | "error";

/** What the user wrote: a note laid on the sheet, right of the reading column. New ones land on a spring. */
function UserNote({ message, land }: { message: ChatUIMessage; land: boolean }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  return (
    <div data-message="user" className="flex justify-end">
      <div className={cn("user-note", land && "msg-land")}>
        <span className="sr-only">You: </span>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}

/**
 * A reply, drawn in the margin: a vertical rule grows with the text. While the reply is live its tip carries
 * the signal dot; when it ends, an end tick lands with the reply's measure (its word count).
 */
function Reply({ message, live, thinking }: { message?: ChatUIMessage; live: boolean; thinking?: boolean }) {
  const words = message ? wordCount(message) : 0;
  return (
    <div data-message="assistant" data-live={live ? "" : undefined} className="reply">
      <span aria-hidden="true" className="reply__rule" />
      <span aria-hidden="true" className="reply__start" />
      <div className="reply__body">
        <span className="sr-only">Brandloop: </span>
        {thinking && (
          <div className="tool-row type-caption text-ink">
            <span aria-hidden="true" className="tool-row__leader" />
            <span aria-hidden="true" className="tool-mark--active" />
            <span className="tool-row__label sweep">Thinking</span>
          </div>
        )}
        {message && <MessageParts message={message} streaming={live} />}
      </div>
      {live ? (
        <span aria-hidden="true" className="reply__tip" />
      ) : (
        words > 0 && (
          <span aria-hidden="true" className="reply__end">
            <span className="reply__measure">{words === 1 ? "1 word" : `${words} words`}</span>
          </span>
        )
      )}
    </div>
  );
}

export function MessageList({
  messages,
  status,
  initialIds,
  errorText,
  onRetry,
}: {
  messages: ChatUIMessage[];
  status: Status;
  initialIds: ReadonlySet<string>;
  errorText: string | null;
  onRetry: () => void;
}) {
  const shown = messages.filter((m) => !m.metadata?.hideInUI);
  const last = shown.at(-1);
  const busy = status === "submitted" || status === "streaming";
  // Waiting on the first chunk: a reply placeholder in the margin.
  const waiting = busy && last?.role === "user";
  return (
    <ol className="flex flex-col gap-8" aria-label="Messages">
      {shown.map((m, i) => (
        <li key={m.id}>
          {m.role === "user" ? (
            <UserNote message={m} land={!initialIds.has(m.id)} />
          ) : (
            <Reply message={m} live={busy && i === shown.length - 1} />
          )}
        </li>
      ))}
      {waiting && (
        <li>
          <Reply live thinking />
        </li>
      )}
      {errorText && !busy && (
        <li>
          <div role="alert" className="flex flex-wrap items-center gap-3 border-l border-signal pl-4">
            <p className="type-ui text-signal-ink">{errorText}</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </li>
      )}
    </ol>
  );
}
