"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@brandloop/ui";
import { CheckIcon, ChevronRightIcon } from "@brandloop/ui/icons";
import { summarizeSteps, type Step } from "./steps";
import { toolStateOf, type ToolPartLike } from "./tool-row";

/** When each live run started and ended, by its first tool call: survives re-renders and the reply's remount. */
const runTimes = new Map<string, { start: number; end?: number }>();

/** Wall-clock time of a run this page watched live; undefined for runs loaded with the page. */
function useRunDuration(key: string | undefined, live: boolean): number | undefined {
  const [, rerender] = useState(0);
  const wasLive = useRef(live);
  useEffect(() => {
    if (!key) return;
    if (live && !runTimes.has(key)) runTimes.set(key, { start: performance.now() });
    const t = runTimes.get(key);
    if (t && !live && wasLive.current && t.end === undefined) {
      t.end = performance.now();
      rerender((n) => n + 1);
    }
    wasLive.current = live;
  }, [key, live]);
  const t = key ? runTimes.get(key) : undefined;
  return t?.end !== undefined ? t.end - t.start : undefined;
}

function StepMark({ state }: { state: Step["state"] }) {
  if (state === "done") return <CheckIcon size={12} aria-hidden="true" className="steps__mark text-text-3" />;
  if (state === "error") return <span aria-hidden="true" className="steps__mark steps__mark--error" />;
  return <span aria-hidden="true" className="steps__mark steps__mark--active" />;
}

/**
 * Tool activity for a run of one or more steps (system §6.13, p03): "Worked through N steps" with the duration on
 * the right. Open while a step runs so the work is visible, collapsed once it ends; the reader's own toggle wins.
 */
export function StepsDisclosure({
  parts,
  durationMs,
  running = false,
}: {
  parts: (ToolPartLike & { toolCallId?: string })[];
  durationMs?: number;
  /** The reply is still on this run (the next step may not have started yet): stay open, keep timing. */
  running?: boolean;
}) {
  const live = running || parts.some((p) => toolStateOf(p) === "active");
  const measured = useRunDuration(parts[0]?.toolCallId, live);
  const s = summarizeSteps(parts, durationMs ?? measured);
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? live;
  const id = useId();
  return (
    <div data-tool-group="" data-open={open ? "" : undefined} className="steps">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setChoice(!open)}
        className="steps__summary"
      >
        <ChevronRightIcon size={12} aria-hidden="true" className="steps__chevron" />
        <span className={cn("min-w-0 truncate", live && "steps__live")}>
          {s.summary}
          {s.failed > 0 && <span className="text-danger">{`, ${s.failed} didn't work`}</span>}
        </span>
        {(s.duration || (live && !open && s.current)) && (
          <span className="ml-auto shrink-0 pl-3 text-xs tabular-nums">
            <span className="sr-only">, </span>
            {s.duration ?? s.current}
          </span>
        )}
      </button>
      <div id={id} role="region" aria-label={s.summary} className="steps__body">
        <ol className="min-h-0 overflow-hidden">
          {s.steps.map((step, i) => (
            <li
              key={i}
              data-tool-row=""
              data-state={step.state}
              className={cn("steps__row", step.state === "error" ? "text-danger" : step.state === "active" ? "text-text-soft" : "text-text-2")}
            >
              <StepMark state={step.state} />
              <span className={cn(step.state === "active" && "steps__live")}>{step.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
