import { toolLabel, type ToolState } from "@brandloop/agent/client";
import { toolNameOf, toolStateOf, type ToolPartLike } from "./tool-row";

export type Step = { label: string; state: ToolState };

export type StepsSummary = {
  steps: Step[];
  /** "Worked through N steps". */
  summary: string;
  failed: number;
  /** Any step still running. */
  live: boolean;
  /** The running step's label, for the collapsed row and the live region. */
  current: string | null;
  duration: string | null;
};

/** "3.1s" under a minute, "1m 05s" above; null when nothing was measured. */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const tenths = Math.max(1, Math.round(ms / 100));
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** A run of tool parts as the steps disclosure shows it. */
export function summarizeSteps(parts: ToolPartLike[], durationMs?: number): StepsSummary {
  const steps = parts.map((p) => {
    const state = toolStateOf(p);
    return { label: toolLabel(toolNameOf(p), state), state };
  });
  const running = steps.filter((s) => s.state === "active").at(-1);
  return {
    steps,
    summary: `Worked through ${steps.length} ${steps.length === 1 ? "step" : "steps"}`,
    failed: steps.filter((s) => s.state === "error").length,
    live: Boolean(running),
    current: running?.label ?? null,
    duration: durationMs === undefined ? null : formatDuration(durationMs),
  };
}
