"use client";

import useSWR from "swr";
import { IntentLink as Link } from "@/components/shell/intent-link";
import { Ring, cn } from "@brandloop/ui";
import { dayLabel } from "@/lib/progress/days";
import { findSprintFormat } from "@/lib/sprint/curriculum";
import { summarizeChallenge, type ChallengeView } from "@/lib/sprint/status";

export type SprintState =
  | { kind: "not-started" }
  | { kind: "upcoming"; startsOn: string }
  | { kind: "active"; day: number; title: string; posted: number; planned: number }
  | { kind: "finished"; posted: number; planned: number };

export const SPRINT_DAYS = 30;

/** The card's copy for a challenge state. Not started is honest: no day, no sample title, an empty ring. */
export function sprintCopy(state: SprintState) {
  if (state.kind === "not-started") {
    return { label: "30-day challenge", title: "Not started", meta: "Start when you're ready", day: null, progress: 0 };
  }
  if (state.kind === "upcoming") {
    return { label: "30-day challenge", title: `Starts ${dayLabel(state.startsOn, { weekday: false })}`, meta: "Not started yet", day: null, progress: 0 };
  }
  if (state.kind === "finished") {
    return { label: "30-day challenge", title: "Finished", meta: `${state.posted} of ${state.planned} posted`, day: null, progress: SPRINT_DAYS };
  }
  return {
    label: "30-day challenge",
    title: `Day ${state.day} · ${state.title}`,
    meta: `${state.posted} of ${state.planned} posted`,
    day: state.day,
    progress: state.day,
  };
}

/**
 * Sidebar challenge card (system §6.9): a `panel` link to `/challenge`, radius 16, padding 16, the progress ring and
 * three lines: "30-day challenge", "Day N · format" and "x of 22 posted" (or "Not started").
 */
export function SprintCard({ state, active = false, onNavigate }: { state: SprintState; active?: boolean; onNavigate?: () => void }) {
  const copy = sprintCopy(state);
  return (
    <Link
      href="/challenge"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "orbit-panel orbit-panel--interactive flex items-center gap-3 !rounded-[16px] p-4",
        active && "!border-[rgba(124,138,255,0.5)]",
      )}
    >
      <Ring value={copy.progress} max={SPRINT_DAYS} label="Sprint progress" size={48}>
        {copy.day ?? undefined}
      </Ring>
      <span className="flex min-w-0 flex-col gap-0.5">
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
      aria-label={copy.day ? `30-day challenge, day ${copy.day}` : `30-day challenge, ${copy.title.toLowerCase()}`}
      className="orbit-transition flex h-11 items-center gap-2 rounded-pill bg-panel pl-3.5 pr-4 text-[13px] font-medium text-text shadow-highlight hover:bg-panel-hover"
    >
      <Ring value={copy.progress} max={SPRINT_DAYS} label="Sprint progress" size={16} strokeWidth={12} />
      {copy.day ? `Day ${copy.day}` : "Challenge"}
    </Link>
  );
}

const KEY = "/api/challenge";

/** The stored challenge as a card state. SWR shares one request between the sidebar, the drawer and the mobile pill. */
export function useSprintState(): SprintState {
  const { data } = useSWR<{ challenge: ChallengeView | null }>(KEY, (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { challenge: null })), {
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  return sprintStateOf(data?.challenge ?? null);
}

export function sprintStateOf(view: ChallengeView | null): SprintState {
  if (!view) return { kind: "not-started" };
  const s = summarizeChallenge(view);
  if (s.phase === "upcoming") return { kind: "upcoming", startsOn: view.startDate };
  if (s.phase === "finished") return { kind: "finished", posted: s.posted, planned: s.postDays };
  const today = s.days.find((d) => d.isToday);
  const title = findSprintFormat(today?.formatId)?.title ?? "Rest day";
  return { kind: "active", day: s.dayNumber ?? 1, title, posted: s.posted, planned: s.postDays };
}
