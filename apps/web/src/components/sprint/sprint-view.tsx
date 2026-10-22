"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { m } from "motion/react";
import { AlertDialog } from "radix-ui";
import { Button, cn, durations, easeOut, useMotionSafe } from "@brandloop/ui";
import { CheckIcon } from "@brandloop/ui/icons";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";
import { dayLabel } from "@/lib/progress/days";
import { sprintDraftHref } from "@/lib/sprint/links";
import { SPRINT_LENGTH, type Sprint, type SprintDay } from "@/lib/sprint/plan";

const rise = (i: number) => ({ "--rise-delay": `${i * 80}ms` }) as CSSProperties;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function statusLabel(d: SprintDay): string {
  if (d.kind === "rest") return d.isToday ? "Today · Rest" : "Rest";
  if (d.isToday) return d.status === "drafted" ? "Today · Drafted" : "Today";
  return { drafted: "Drafted", missed: "Missed", upcoming: dayLabel(d.key, { weekday: false }), today: "Today", rest: "Rest" }[d.status];
}

function footerLabel(d: SprintDay): string {
  if (d.isToday) return d.status === "drafted" ? "Draft another" : "Draft";
  return { drafted: "Drafted", missed: "Catch up", upcoming: "Read the brief", today: "Draft", rest: "" }[d.status];
}

/**
 * The 30-day sprint (screens.md B9): header stats, the status line, the selected day's format with a draft button,
 * the Monday-first calendar and the finish card. Everything comes from `buildSprint`; nothing here is saved.
 */
export function SprintView({ sprint, pinned }: { sprint: Sprint; pinned: boolean }) {
  const [selected, setSelected] = useState<number>(sprint.focus?.day ?? sprint.days.find((d) => d.kind === "post")!.day);
  const day = sprint.days[selected - 1]!;
  const lastRowUsed = (sprint.leadingBlanks + SPRINT_LENGTH) % 7;
  const finishSpan = lastRowUsed === 0 ? 7 : 7 - lastRowUsed;
  const firstMissed = sprint.days.find((d) => d.status === "missed");

  return (
    <div className="w-full max-w-[1240px] px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <header className="orbit-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="type-page-title text-text focus-visible:outline-none">30-day sprint</h1>
          <p className="max-w-[60ch] text-[14px] text-text-2">
            One proven post format every weekday, with what to write and a draft to start from.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
          <HeaderStat sprint={sprint} />
          <Button
            variant="secondary"
            aria-disabled="true"
            aria-describedby="sprint-share-note"
            onClick={(e) => e.preventDefault()}
            className="!border-line-3"
          >
            Share progress
          </Button>
          <span id="sprint-share-note" className="sr-only">
            Sharing arrives once sprint progress is saved to your account.
          </span>
          {pinned && <EndSprint />}
        </div>
      </header>

      <StatusLine sprint={sprint} pinned={pinned} onCatchUp={firstMissed ? () => setSelected(firstMissed.day) : undefined} />

      <FormatPanel day={day} />

      <section aria-labelledby="sprint-calendar" className="mt-6">
        <h2 id="sprint-calendar" className="sr-only">
          Sprint calendar
        </h2>
        <div aria-hidden="true" className="orbit-rise mb-2 hidden grid-cols-7 gap-2 px-1 text-[12px] text-text-3 md:grid" style={rise(3)}>
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <ol className="orbit-rise grid grid-cols-2 gap-2 md:grid-cols-7" style={rise(4)}>
          {Array.from({ length: sprint.leadingBlanks }, (_, i) => (
            <li key={`blank-${i}`} aria-hidden="true" className="hidden md:block" />
          ))}
          {sprint.days.map((d) => (
            <li key={d.key} className="min-w-0">
              <DayCell day={d} selected={d.day === selected} onSelect={() => setSelected(d.day)} />
            </li>
          ))}
          <li className="col-span-2 md:col-[span_var(--finish-span)]" style={{ "--finish-span": finishSpan } as CSSProperties}>
            <FinishCard sprint={sprint} />
          </li>
        </ol>
      </section>
    </div>
  );
}

function HeaderStat({ sprint }: { sprint: Sprint }) {
  const main =
    sprint.phase === "active" ? (
      <>
        Day {sprint.dayNumber}
        <span className="text-text-3">/{SPRINT_LENGTH}</span>
      </>
    ) : sprint.phase === "finished" ? (
      "Finished"
    ) : (
      <>Starts {dayLabel(sprint.start, { weekday: false })}</>
    );
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-display text-[36px] font-medium leading-none tracking-[-0.03em] tabular-nums [font-variation-settings:'opsz'_96,'wdth'_85] md:text-[44px]">
        {main}
      </span>
      <span className="text-[13px] text-text-2">
        {sprint.drafted} of {sprint.postDays} drafted
      </span>
    </span>
  );
}

function StatusLine({ sprint, pinned, onCatchUp }: { sprint: Sprint; pinned: boolean; onCatchUp?: () => void }) {
  let lead: string;
  let rest: string;
  if (!pinned) {
    lead = "Preview from today.";
    rest = "Sprint progress isn't saved to your account yet, so day ticks come from the drafts you start each day.";
  } else if (sprint.phase === "finished") {
    lead = "Sprint finished.";
    rest = `You drafted ${sprint.drafted} of ${sprint.postDays} posts.`;
  } else if (sprint.phase === "upcoming") {
    lead = "Not started yet.";
    rest = `Day 1 is ${dayLabel(sprint.start)}.`;
  } else if (sprint.missed > 0) {
    lead = "Don't break the chain.";
    rest = `You've missed ${sprint.missed} ${sprint.missed === 1 ? "day" : "days"}. Drafting today still counts.`;
  } else {
    lead = "Keep the chain going.";
    rest = sprint.drafted ? `${sprint.drafted} drafted so far.` : "Today's format is below.";
  }
  return (
    <div
      className="orbit-rise mt-5 flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-line bg-panel px-[18px] py-3.5 shadow-highlight"
      style={rise(1)}
    >
      <p className="flex min-w-0 items-start gap-3 text-[14px]">
        <span aria-hidden="true" className="mt-[7px] size-2 shrink-0 rounded-full bg-accent-text" />
        <span>
          <span className="font-medium text-text">{lead}</span> <span className="text-text-2">{rest}</span>
        </span>
      </p>
      {!pinned ? (
        <Button asChild variant="secondary" size="sm" className="!border-line-3">
          <Link href={`/challenge?start=${sprint.start}`} title="Bookmark the page afterwards to come back to the same sprint">
            Keep today as day 1
          </Link>
        </Button>
      ) : onCatchUp && sprint.phase === "active" ? (
        <Button size="sm" className="h-9 px-4" onClick={onCatchUp}>
          Catch up
        </Button>
      ) : null}
    </div>
  );
}

function FormatPanel({ day }: { day: SprintDay }) {
  const motionSafe = useMotionSafe();
  const format = day.format;
  return (
    <section aria-labelledby="sprint-format-title" aria-live="polite" className="orbit-panel orbit-rise mt-3 overflow-hidden !rounded-[20px]" style={rise(2)}>
      <m.div
        key={day.day}
        initial={motionSafe ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.hover, ease: easeOut }}
        className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-10 md:p-6"
      >
        <div className="min-w-0">
          <p className={cn("text-[12px]", day.isToday ? "text-accent-text-2" : "text-text-2")}>
            Day {day.day} · {dayLabel(day.key)} · {statusLabel(day)}
          </p>
          {format ? (
            <>
              <h2 id="sprint-format-title" className="type-card-title mt-2 text-text">
                {format.title}
              </h2>
              <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-text-soft">{format.brief}</p>
              <ol className="mt-4 grid gap-2 text-[13px] leading-[1.5] text-text-2 md:grid-cols-3 md:gap-4">
                {format.steps.map((s, i) => (
                  <li key={s} className="flex gap-2.5 md:flex-col md:gap-1.5 md:border-t md:border-line md:pt-3">
                    <span className="shrink-0 tabular-nums text-text-3">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 max-w-[62ch] text-[13px] leading-[1.55] text-text-3">
                <span className="text-text-2">An opening that fits:</span> “{format.example}”
              </p>
            </>
          ) : (
            <>
              <h2 id="sprint-format-title" className="type-card-title mt-2 text-text">
                Rest day
              </h2>
              <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-text-soft">
                Weekends have no post planned. Reply to comments if you like, then pick up again on the next weekday.
              </p>
            </>
          )}
        </div>
        {format && (
          <div className="flex flex-col items-start gap-2 md:items-end md:pt-6">
            <Button asChild>
              <Link href={sprintDraftHref(format.id, day.day)}>{day.isToday ? "Draft today's post" : "Draft this post"}</Link>
            </Button>
            <span className="text-[12px] text-text-3">
              {day.drafts > 0
                ? `${day.drafts} ${day.drafts === 1 ? "draft" : "drafts"} started that day`
                : "Opens a new chat with this format"}
            </span>
          </div>
        )}
      </m.div>
    </section>
  );
}

function DayCell({ day, selected, onSelect }: { day: SprintDay; selected: boolean; onSelect: () => void }) {
  if (day.kind === "rest") {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "orbit-transition flex h-full min-h-[72px] w-full flex-col gap-1.5 rounded-[14px] border border-dashed border-line-2 p-3.5 text-left text-text-3 hover:border-line-hover md:min-h-[96px]",
          selected && "border-solid border-line-control",
        )}
      >
        <span className="text-[11px]">
          Day {day.day} · {statusLabel(day)}
          <span className="sr-only">, {dayLabel(day.key)}</span>
        </span>
        <span className="mt-auto text-[11px]">No post planned</span>
      </button>
    );
  }
  const live = day.isToday;
  const done = day.status === "drafted";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "orbit-transition flex h-full min-h-[72px] w-full flex-col gap-2 rounded-[14px] border bg-panel p-3.5 text-left hover:bg-panel-hover md:min-h-[96px]",
        live ? "border-cobalt shadow-[0_0_0_1px_var(--cobalt),0_10px_30px_rgba(79,95,245,0.22)]" : "border-line hover:border-line-hover",
        selected && !live && "border-line-control",
        day.status === "upcoming" ? "text-text-soft" : day.status === "missed" ? "text-text-soft" : "text-text",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-[11px]", live ? "text-accent-text-2" : "text-text-3")}>
        {done && (
          <span aria-hidden="true" className="grid size-3.5 place-items-center rounded-full bg-accent-text text-on-accent">
            <CheckIcon className="size-2.5" />
          </span>
        )}
        Day {day.day} · {live ? "Today" : statusLabel(day)}
        {done && live && <span className="sr-only">, drafted</span>}
        {day.status !== "upcoming" && <span className="sr-only">, {dayLabel(day.key)}</span>}
        <span className="sr-only">,</span>
      </span>
      <span className="text-[13px] font-medium leading-[1.3]">{day.format?.title}</span>
      <span className={cn("mt-auto text-[12px]", live ? "font-medium text-accent-text-2" : "text-text-2")}>{footerLabel(day)}</span>
    </button>
  );
}

function FinishCard({ sprint }: { sprint: Sprint }) {
  const pct = sprint.postDays ? (sprint.drafted / sprint.postDays) * 100 : 0;
  const toGo = sprint.postDays - sprint.drafted;
  return (
    <div className="flex h-full min-h-[96px] flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-panel px-[18px] py-3.5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[11px] text-text-2">Finish line · {dayLabel(sprint.finish, { weekday: false })}</span>
        <span className="font-display text-[20px] font-medium tracking-[-0.03em] text-text">Sprint badge</span>
        <div
          role="progressbar"
          aria-label="Sprint drafts"
          aria-valuemin={0}
          aria-valuemax={sprint.postDays}
          aria-valuenow={sprint.drafted}
          className="h-1.5 w-[220px] max-w-full overflow-hidden rounded-pill bg-line"
        >
          <div className="h-full rounded-pill bg-accent-text" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-display text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums text-text">{sprint.streak}</span>
        <span className="text-[11px] text-text-2">
          day streak · {toGo} to go
        </span>
      </div>
    </div>
  );
}

function EndSprint() {
  const router = useRouter();
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" className="px-2 text-text-3">
          End sprint
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlayClass} />
        <AlertDialog.Content className={`${dialogContentClass} max-w-md`}>
          <AlertDialog.Title className={dialogTitleClass}>End this sprint?</AlertDialog.Title>
          <AlertDialog.Description className={dialogDescriptionClass}>
            The calendar goes back to a preview starting today. Your drafts stay where they are.
          </AlertDialog.Description>
          <div className={dialogActionsClass}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Keep going</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={() => router.push("/challenge")}>
                End sprint
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
