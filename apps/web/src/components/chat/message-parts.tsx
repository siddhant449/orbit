"use client";

import { lazy, Suspense } from "react";
import { collapseToolRuns, parseProposal, type ChatUIMessage, type Proposal } from "@brandloop/agent/client";
import { cn } from "@brandloop/ui";
import { AnalysisCard, analysisOf } from "./analysis-card";
import { DraftCard } from "./document-panel";
import { HookCards, hookCardsOf } from "./hook-cards";
import { ProposalCard } from "./proposal-card";
import { ReviewCard, reviewChecksOf } from "./review-card";
import { MemoryTag, memoryTagOf } from "./memory-tag";
import { StepsDisclosure } from "./steps-disclosure";
import type { ToolPartLike } from "./tool-row";

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

/**
 * An assistant message's parts: markdown text, every run of tool calls folded into "Worked through N steps"
 * (decision D6), then the post card, edit proposals and memory confirmations.
 */
export function MessageParts({ message, streaming }: { message: ChatUIMessage; streaming: boolean }) {
  const visible = (message.parts as Part[]).filter(
    (p) => p.type === "text" || p.type === "step-start" || isToolPart(p),
  );
  const items = collapseToolRuns(visible as { type: string }[], 1);
  // Only the newest text block carries the caret.
  let lastText = -1;
  items.forEach((it, i) => {
    if (it.type === "text") lastText = i;
  });
  const draft = createdPost(message.parts as Part[]);
  const proposals = proposalsIn(message.parts as Part[]);
  const memories = (message.parts as ToolPartLike[]).flatMap((p, i) => {
    const tag = memoryTagOf(p);
    return tag ? [{ key: i, ...tag }] : [];
  });
  const reviews = (message.parts as (ToolPartLike & { toolCallId?: string })[]).flatMap((p, i) => {
    const checks = reviewChecksOf(p);
    return checks ? [{ key: p.toolCallId ?? String(i), checks }] : [];
  });
  const hookSets = hookCardsOf(message.parts as ToolPartLike[]);
  const analyses = (message.parts as ToolPartLike[]).flatMap((p) => {
    const a = analysisOf(p);
    return a ? [a] : [];
  });
  return (
    <>
      {items.map((it, i) => {
        if (it.type === "tool-group") {
          return <StepsDisclosure key={i} parts={(it as { parts: ToolPartLike[] }).parts} running={streaming && i === items.length - 1} />;
        }
        if (it.type === "text") {
          const text = (it as unknown as { text: string }).text;
          if (!text.trim()) return null;
          return <TextBlock key={i} text={text} streaming={streaming && i === lastText && i === items.length - 1} />;
        }
        return null;
      })}
      {draft && <DraftCard fallback={draft} />}
      {analyses.map((a, i) => (
        <AnalysisCard key={i} analysis={a} />
      ))}
      {hookSets.map((cards, i) => (
        <HookCards key={i} cards={cards} />
      ))}
      {reviews.map(({ key, checks }) => (
        <ReviewCard key={key} checks={checks} />
      ))}
      {proposals.map(({ toolCallId, proposal }) => (
        <ProposalCard key={toolCallId} toolCallId={toolCallId} proposal={proposal} />
      ))}
      {memories.map(({ key, area, change }) => (
        <MemoryTag key={key} area={area} change={change} />
      ))}
    </>
  );
}

/** The reply's visible words, for Copy. */
export function replyText(message: ChatUIMessage): string {
  return (message.parts as Part[])
    .map((p) => (p.type === "text" ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

/** Whether the reply has shown anything yet (text, a step, a card). */
export function hasVisibleParts(message: ChatUIMessage): boolean {
  return (message.parts as Part[]).some((p) => (p.type === "text" ? p.text.trim().length > 0 : isToolPart(p)));
}

/** The post a createDocument call in this message made, as its output had it. */
function createdPost(parts: Part[]): { id: string; title: string; version: number; text: string } | null {
  for (const p of parts as ToolPartLike[]) {
    if (p.type !== "tool-createDocument" || p.state !== "output-available") continue;
    const o = p.output as { success?: unknown; id?: unknown; title?: unknown; postContent?: unknown } | undefined;
    if (o?.success === true && typeof o.id === "string" && typeof o.title === "string" && typeof o.postContent === "string") {
      return { id: o.id, title: o.title, version: 1, text: o.postContent };
    }
  }
  return null;
}

/** Completed edit proposals in this message, in order (shown after the activity rows, even inside a collapsed group). */
function proposalsIn(parts: Part[]): { toolCallId: string; proposal: Proposal }[] {
  const out: { toolCallId: string; proposal: Proposal }[] = [];
  for (const p of parts as (ToolPartLike & { toolCallId?: string })[]) {
    if (p.type !== "tool-proposeDocumentEdits" || p.state !== "output-available" || typeof p.toolCallId !== "string") continue;
    const proposal = parseProposal(p.output);
    if (proposal) out.push({ toolCallId: p.toolCallId, proposal });
  }
  return out;
}
