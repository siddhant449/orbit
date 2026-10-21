"use client";

import { lazy, Suspense } from "react";
import { collapseToolRuns, type ChatUIMessage } from "@brandloop/agent/client";
import { cn } from "@brandloop/ui";
import { ToolGroup, ToolRow, type ToolPartLike } from "./tool-row";

// Its own chunk, requested as soon as the chat code loads, so stored replies rarely show the plain fallback.
const loadMarkdown = () => import("./markdown");
if (typeof window !== "undefined") void loadMarkdown();
const Markdown = lazy(loadMarkdown);

type Part = ChatUIMessage["parts"][number];

/** Until the markdown chunk arrives, the text shows as written. */
function PlainText({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className={cn("md", streaming && "md--streaming")}>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

export function TextBlock({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Suspense fallback={<PlainText text={text} streaming={streaming} />}>
      <Markdown text={text} streaming={streaming} />
    </Suspense>
  );
}

const isToolPart = (p: { type: string }) => p.type.startsWith("tool-") || p.type === "dynamic-tool";

/** An assistant message's parts: markdown text, one-line tool rows, and groups for runs of three or more. */
export function MessageParts({ message, streaming }: { message: ChatUIMessage; streaming: boolean }) {
  const visible = (message.parts as Part[]).filter(
    (p) => p.type === "text" || p.type === "step-start" || isToolPart(p),
  );
  const items = collapseToolRuns(visible as { type: string }[]);
  // Only the newest text block carries the caret.
  let lastText = -1;
  items.forEach((it, i) => {
    if (it.type === "text") lastText = i;
  });
  return (
    <>
      {items.map((it, i) => {
        if (it.type === "tool-group") return <ToolGroup key={i} parts={(it as { parts: ToolPartLike[] }).parts} />;
        if (it.type === "text") {
          const text = (it as unknown as { text: string }).text;
          if (!text.trim()) return null;
          return <TextBlock key={i} text={text} streaming={streaming && i === lastText && i === items.length - 1} />;
        }
        if (isToolPart(it)) return <ToolRow key={i} part={it as ToolPartLike} />;
        return null;
      })}
    </>
  );
}

export function wordCount(message: ChatUIMessage): number {
  const text = (message.parts as Part[])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
  return text ? text.split(/\s+/).length : 0;
}
