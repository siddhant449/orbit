import Link from "next/link";
import { Ring, cn } from "@brandloop/ui";

export type SprintState =
  | { kind: "not-started" }
  | { kind: "active"; day: number; title: string; posted: number; planned: number };

export const SPRINT_DAYS = 30;

/** The card's copy for a sprint state. Not started is honest: no day, no sample title, an empty ring. */
export function sprintCopy(state: SprintState) {
  if (state.kind === "not-started") {
    return { label: "30-day sprint", title: "Not started", meta: "Start when you're ready", day: null, progress: 0 };
  }
  return {
    label: "30-day sprint",
    title: `Day ${state.day} · ${state.title}`,
    meta: `${state.posted} of ${state.planned} posted`,
    day: state.day,
    progress: state.day,
  };
}

/**
 * Sidebar sprint card (system §6.9): a `panel` link to `/challenge`, radius 16, padding 16, the 52 px progress ring
 * and three lines. O2 always passes `not-started` (the challenge feature is O11).
 */
export function SprintCard({ state, active = false, onNavigate }: { state: SprintState; active?: boolean; onNavigate?: () => void }) {
  const copy = sprintCopy(state);
  return (
    <Link
      href="/challenge"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "orbit-panel orbit-panel--interactive flex items-center gap-3.5 !rounded-[16px] p-4",
        active && "!border-[rgba(124,138,255,0.5)]",
      )}
    >
      <Ring value={copy.progress} max={SPRINT_DAYS} label="Sprint progress" size={52}>
        {copy.day ?? undefined}
      </Ring>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-[11px] text-text-2">{copy.label}</span>
        <span className="text-[14px] font-medium leading-[1.25] text-text">{copy.title}</span>
        <span className="text-[11px] text-text-2">{copy.meta}</span>
      </span>
    </Link>
  );
}

/** Mobile header pill (system §9, p16): a 16 px ring and the day, or "Sprint" before it starts. */
export function SprintPill({ state }: { state: SprintState }) {
  const copy = sprintCopy(state);
  return (
    <Link
      href="/challenge"
      aria-label={copy.day ? `30-day sprint, day ${copy.day}` : "30-day sprint, not started"}
      className="orbit-transition flex h-9 items-center gap-2 rounded-pill bg-panel pl-2.5 pr-3 text-[12px] font-medium text-text shadow-highlight hover:bg-panel-hover"
    >
      <Ring value={copy.progress} max={SPRINT_DAYS} label="Sprint progress" size={16} strokeWidth={12} />
      {copy.day ? `Day ${copy.day}` : "Sprint"}
    </Link>
  );
}
