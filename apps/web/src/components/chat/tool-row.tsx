"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { isToolError, toolLabel, type ToolState } from "@brandloop/agent/client";
import { cn } from "@brandloop/ui";

export type ToolPartLike = { type: string; state?: string; output?: unknown; errorText?: string; toolName?: string };

export function toolNameOf(part: ToolPartLike): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "") : part.type.slice("tool-".length);
}

export function toolStateOf(part: ToolPartLike): ToolState {
  if (part.state === "output-error" || part.state === "output-denied") return "error";
  if (part.state === "output-available") return isToolError(part.output) ? "error" : "done";
  return "active";
}

/** The drawn tick: a check whose stroke draws in once (complete at once under reduced motion). */
function Tick() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className="tool-tick size-3.5 shrink-0">
      <path d="M2.5 7.5 5.5 10.5 11.5 3.5" pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" />
    </svg>
  );
}

function Mark({ state }: { state: ToolState }) {
  if (state === "done") return <Tick />;
  if (state === "error") return <span aria-hidden="true" className="tool-mark--error" />;
  return <span aria-hidden="true" className="tool-mark--active" />;
}

/** One activity row: a leader line draws in, then the label; active rows carry a sweeping hairline. */
export function ToolRow({ part }: { part: ToolPartLike }) {
  const state = toolStateOf(part);
  const label = toolLabel(toolNameOf(part), state);
  return (
    <div
      data-tool-row=""
      data-state={state}
      className={cn("tool-row type-caption", state === "error" ? "text-signal-ink" : state === "active" ? "text-ink" : "text-ink-muted")}
    >
      <span aria-hidden="true" className="tool-row__leader" />
      <Mark state={state} />
      <span className={cn("tool-row__label", state === "active" && "sweep")}>{label}</span>
    </div>
  );
}

/** Three or more steps in a row: one line, "Worked through N steps", with the steps behind a disclosure. */
export function ToolGroup({ parts }: { parts: ToolPartLike[] }) {
  const [open, setOpen] = useState(false);
  const states = parts.map(toolStateOf);
  const active = parts.find((_, i) => states[i] === "active");
  const failed = states.filter((s) => s === "error").length;
  return (
    <div data-tool-group="">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="tool-row type-caption -mx-1 rounded-control px-1 text-ink-muted hover:text-ink"
      >
        <span aria-hidden="true" className="tool-row__leader" />
        <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")} />
        <span>
          Worked through {parts.length} steps
          {failed > 0 && <span className="text-signal-ink">{`, ${failed} didn't work`}</span>}
        </span>
      </button>
      {open && (
        <div className="ml-[22px] border-l border-line pl-3">
          {parts.map((p, i) => (
            <ToolRow key={i} part={p} />
          ))}
        </div>
      )}
      {!open && active && (
        <div className="ml-[22px] pl-3">
          <ToolRow part={active} />
        </div>
      )}
    </div>
  );
}
