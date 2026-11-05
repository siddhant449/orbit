"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { m } from "motion/react";
import { AlertDialog } from "radix-ui";
import { Button, Input, Label, cn, durations, easeOut, useMotionSafe } from "@brandloop/ui";
import { CheckIcon } from "@brandloop/ui/icons";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
} from "@/components/dialog-classes";
import { dayLabel, weekdayOf } from "@/lib/progress/days";
import { findSprintFormat } from "@/lib/sprint/curriculum";
import { summarizeChallenge, type ChallengeDayView, type ChallengeSummary, type ChallengeView, type DayStatus } from "@/lib/sprint/status";

const rise = (i: number) => ({ "--rise-delay": `${i * 80}ms` }) as CSSProperties;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LENGTH = 30;

function statusLabel(d: ChallengeDayView): string {
  if (!d.formatId) return d.isToday ? "Today · Rest" : "Rest";
  const label: Record<DayStatus, string> = {
    rest: "Rest",
    upcoming: dayLabel(d.date, { weekday: false }),
    today: "Today",
    in_progress: "In progress",
    posted: "Posted",
    missed: "Missed",
  };
  return d.isToday && d.status !== "today" ? `Today · ${label[d.status]}` : label[d.status];
}

function footerLabel(d: ChallengeDayView): string {
  return { rest: "", upcoming: "Read the brief", today: "Continue", in_progress: "Continue", posted: "Posted", missed: "Catch up" }[d.status];
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Runs a challenge change, then refreshes the page and the sidebar card. Errors come back as a toast. */
function useChallengeActions() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, onOk?: (data: Record<string, unknown>) => void) {
    if (busy) return;
    setBusy(key);
    try {
      const out = await fn();
      if (!out.ok) throw new Error(typeof out.data.error === "string" ? out.data.error : "That didn't work. Try again.");
      void mutate("/api/challenge");
      if (onOk) onOk(out.data);
      else router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
    setBusy(null);
  }
  return { busy, run, router };
}

/**
 * The 30-day challenge (screens.md B9): before it starts, Start (today or a date); once started, the stored calendar with
 * each day's status, the selected day's format with Continue / Catch up, the missed banner, End, and a finished summary
 * with Start again. Everything comes from the stored enrollment; a post counts once it is marked as posted.
 */
export function SprintView({ challenge, today }: { challenge: ChallengeView | null; today: string }) {
  if (!challenge) return <StartScreen today={today} />;
  return <RunningView challenge={challenge} />;
}

function PageTitle({ children }: { children?: React.ReactNode }) {
  return (
    <header className="orbit-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="type-page-title text-text focus-visible:outline-none">30-day challenge</h1>
        <p className="max-w-[60ch] text-[14px] text-text-2">One proven post format every weekday, with what to write and a draft to start from.</p>
      </div>
      {children}
    </header>
  );
}

function StartScreen({ today }: { today: string }) {
  const { busy, run, router } = useChallengeActions();
  const [date, setDate] = useState(today);
  const start = (startDate?: string) =>
    run("start", () => call("/api/challenge", "POST", startDate ? { startDate } : {}), () => router.refresh());
  return (
    <div className="w-full px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <PageTitle />
      <section aria-labelledby="start-title" className="orbit-panel orbit-rise mt-6 !rounded-[20px] p-5 md:p-6" style={rise(1)}>
        <h2 id="start-title" className="type-card-title text-text">
          Start the challenge
        </h2>
        <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-text-soft">
          Thirty days from your start date. Weekdays are posting days, each with its own format; weekends are rest. A post counts once you mark it as posted.
          You can post a missed day later and it still counts.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4">
          <Button onClick={() => void start()} disabled={busy !== null}>
            {busy === "start" ? "Starting…" : "Start today"}
          </Button>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void start(date);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="challenge-start">Or choose a start date</Label>
              <Input id="challenge-start" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-[190px]" />
            </div>
            <Button type="submit" variant="secondary" disabled={busy !== null || !date}>
              Start on this date
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

function RunningView({ challenge }: { challenge: ChallengeView }) {
  const summary = summarizeChallenge(challenge);
  const { busy, run, router } = useChallengeActions();
  const [selected, setSelected] = useState<number>(summary.focus?.dayNumber ?? summary.days.find((d) => d.formatId)!.dayNumber);
  const day = summary.days[selected - 1]!;
  const leadingBlanks = (weekdayOf(challenge.startDate) + 6) % 7;
  const lastRowUsed = (leadingBlanks + LENGTH) % 7;
  const finishSpan = lastRowUsed === 0 ? 7 : 7 - lastRowUsed;
  const firstMissed = summary.days.find((d) => d.status === "missed");
  const finished = summary.phase === "finished";

  return (
    <div className="w-full px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <PageTitle>
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
          <HeaderStat summary={summary} startDate={challenge.startDate} />
          {!finished && <EndChallenge onEnd={() => run("end", () => call("/api/challenge", "DELETE"))} busy={busy === "end"} />}
        </div>
      </PageTitle>

      {finished ? (
        <FinishedSummary summary={summary} ended={challenge.endedAt !== null} onAgain={() => run("again", () => call("/api/challenge", "POST", {}))} busy={busy === "again"} />
      ) : (
        <StatusLine summary={summary} startDate={challenge.startDate} onCatchUp={firstMissed ? () => setSelected(firstMissed.dayNumber) : undefined} />
      )}

      <FormatPanel
        day={day}
        finished={finished}
        busy={busy}
        onOpen={() =>
          run(
            `open-${day.dayNumber}`,
            () => call(`/api/challenge/days/${day.dayNumber}/open`, "POST"),
            (data) => router.push(`/chat/${String(data.chatId)}`),
          )
        }
        onPosted={() => day.doc && run("posted", () => call(`/api/documents/${encodeURIComponent(day.doc!.id)}/posted`, "POST"))}
      />

      <section aria-labelledby="sprint-calendar" className="mt-6">
        <h2 id="sprint-calendar" className="sr-only">
          Challenge calendar
        </h2>
        <div aria-hidden="true" className="orbit-rise mb-2 hidden grid-cols-7 gap-2 px-1 text-[12px] text-text-3 md:grid" style={rise(3)}>
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <ol className="orbit-rise grid grid-cols-2 gap-2 md:grid-cols-7" style={rise(4)}>
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <li key={`blank-${i}`} aria-hidden="true" className="hidden md:block" />
          ))}
          {summary.days.map((d) => (
            <li key={d.date} className="min-w-0">
              <DayCell day={d} selected={d.dayNumber === selected} onSelect={() => setSelected(d.dayNumber)} />
            </li>
          ))}
          <li className="col-span-2 md:col-[span_var(--finish-span)]" style={{ "--finish-span": finishSpan } as CSSProperties}>
            <FinishCard summary={summary} finish={challenge.finishDate} />
          </li>
        </ol>
      </section>
    </div>
  );
}

function HeaderStat({ summary, startDate }: { summary: ChallengeSummary; startDate: string }) {
  const main =
    summary.phase === "active" ? (
      <>
        Day {summary.dayNumber}
        <span className="text-text-3">/{LENGTH}</span>
      </>
    ) : summary.phase === "finished" ? (
      "Finished"
    ) : (
      <>Starts {dayLabel(startDate, { weekday: false })}</>
    );
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-display text-[36px] font-medium leading-none tracking-[-0.03em] tabular-nums [font-variation-settings:'opsz'_96,'wdth'_85] md:text-[44px]">
        {main}
      </span>
      <span className="text-[13px] text-text-2">
        {summary.posted} of {summary.postDays} posted
      </span>
    </span>
  );
}

function StatusLine({ summary, startDate, onCatchUp }: { summary: ChallengeSummary; startDate: string; onCatchUp?: () => void }) {
  let lead: string;
  let rest: string;
  if (summary.phase === "upcoming") {
    lead = "Not started yet.";
    rest = `Day 1 is ${dayLabel(startDate)}.`;
  } else if (summary.missed > 0) {
    lead = `You've missed ${summary.missed} ${summary.missed === 1 ? "day" : "days"}.`;
    rest = "Posting today still counts, and any missed day can be written and posted later.";
  } else {
    lead = "On track.";
    rest = summary.posted ? `${summary.posted} posted so far, none missed.` : "Today's format is below.";
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
      {onCatchUp && summary.phase === "active" ? (
        <Button size="sm" className="h-9 px-4" onClick={onCatchUp}>
          Catch up
        </Button>
      ) : null}
    </div>
  );
}

function FinishedSummary({ summary, ended, onAgain, busy }: { summary: ChallengeSummary; ended: boolean; onAgain: () => void; busy: boolean }) {
  return (
    <section aria-labelledby="finished-title" className="orbit-panel orbit-rise mt-5 !rounded-[20px] p-5 md:p-6" style={rise(1)}>
      <h2 id="finished-title" className="type-card-title text-text">
        {ended ? "Challenge ended" : "Challenge finished"}
      </h2>
      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <dt className="text-[12px] text-text-2">Posts</dt>
          <dd className="font-display text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums text-text">
            {summary.posted}
            <span className="text-text-3"> of {summary.postDays}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[12px] text-text-2">Best streak</dt>
          <dd className="font-display text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums text-text">
            {summary.bestStreak}
            <span className="text-text-3"> {summary.bestStreak === 1 ? "weekday" : "weekdays"}</span>
          </dd>
        </div>
      </dl>
      <div className="mt-5">
        <Button onClick={onAgain} disabled={busy}>
          {busy ? "Starting…" : "Start again"}
        </Button>
      </div>
    </section>
  );
}

function FormatPanel({
  day,
  finished,
  busy,
  onOpen,
  onPosted,
}: {
  day: ChallengeDayView;
  finished: boolean;
  busy: string | null;
  onOpen: () => void;
  onPosted: () => void;
}) {
  const motionSafe = useMotionSafe();
  const format = findSprintFormat(day.formatId);
  const canOpen = !finished && (day.status === "today" || day.status === "in_progress" || day.status === "missed");
  const openLabel = day.status === "missed" ? "Catch up" : "Continue";
  return (
    <section aria-labelledby="sprint-format-title" aria-live="polite" className="orbit-panel orbit-rise mt-3 overflow-hidden !rounded-[20px]" style={rise(2)}>
      <m.div
        key={day.dayNumber}
        initial={motionSafe ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.hover, ease: easeOut }}
        className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-10 md:p-6"
      >
        <div className="min-w-0">
          <p className={cn("text-[12px]", day.isToday ? "text-accent-text-2" : "text-text-2")}>
            Day {day.dayNumber} · {dayLabel(day.date)} · {statusLabel(day)}
          </p>
          {format ? (
            <>
              <h2 id="sprint-format-title" className="type-card-title mt-2 text-text">
                {format.title}
              </h2>
              <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-text-soft">{format.brief}</p>
              <p className="mt-2 text-[12px] text-text-3">About 25 minutes</p>
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
                Rest · No post planned
              </h2>
              <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.6] text-text-soft">
                Weekends have no post planned. Reply to comments if you like, then pick up again on the next weekday.
              </p>
            </>
          )}
        </div>
        {format && (
          <div className="flex flex-col items-start gap-2 md:items-end md:pt-6">
            {canOpen && (
              <Button onClick={onOpen} disabled={busy !== null}>
                {busy === `open-${day.dayNumber}` ? "Opening…" : openLabel}
              </Button>
            )}
            {day.doc && (
              <Button asChild variant="secondary">
                <Link href={`/posts/${encodeURIComponent(day.doc.id)}`}>Open post</Link>
              </Button>
            )}
            {day.status === "in_progress" && !finished && (
              <Button variant="secondary" onClick={onPosted} disabled={busy !== null}>
                Mark as posted
              </Button>
            )}
            <span className="max-w-[26ch] text-[12px] text-text-3 md:text-right">
              {day.status === "posted"
                ? "Marked as posted."
                : day.status === "upcoming"
                  ? `Opens on ${dayLabel(day.date, { weekday: false })}.`
                  : day.status === "in_progress"
                    ? "A draft is started. Mark it as posted once you've posted it."
                    : day.status === "missed"
                      ? "Posting this later still counts for this day."
                      : "Opens a chat with this format."}
            </span>
          </div>
        )}
      </m.div>
    </section>
  );
}

function DayCell({ day, selected, onSelect }: { day: ChallengeDayView; selected: boolean; onSelect: () => void }) {
  if (!day.formatId) {
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
          Day {day.dayNumber} · {statusLabel(day)}
          <span className="sr-only">, {dayLabel(day.date)}</span>
        </span>
        <span className="mt-auto text-[11px]">Rest · No post planned</span>
      </button>
    );
  }
  const live = day.isToday;
  const done = day.status === "posted";
  const format = findSprintFormat(day.formatId);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "orbit-transition flex h-full min-h-[72px] w-full flex-col gap-2 rounded-[14px] border bg-panel p-3.5 text-left hover:bg-panel-hover md:min-h-[96px]",
        live ? "border-cobalt shadow-[0_0_0_1px_var(--cobalt),0_10px_30px_rgba(79,95,245,0.22)]" : "border-line hover:border-line-hover",
        selected && !live && "border-line-control",
        day.status === "upcoming" || day.status === "missed" ? "text-text-soft" : "text-text",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-[11px]", live ? "text-accent-text-2" : "text-text-2")}>
        {done && (
          <span aria-hidden="true" className="grid size-3.5 place-items-center rounded-full bg-accent-text text-on-accent">
            <CheckIcon className="size-2.5" />
          </span>
        )}
        Day {day.dayNumber} · {statusLabel(day)}
        {day.status !== "upcoming" && <span className="sr-only">, {dayLabel(day.date)}</span>}
        <span className="sr-only">,</span>
      </span>
      <span className="text-[13px] font-medium leading-[1.3]">{format?.title ?? "Post day"}</span>
      <span className={cn("mt-auto text-[12px]", live ? "font-medium text-accent-text-2" : "text-text-2")}>{footerLabel(day)}</span>
    </button>
  );
}

function FinishCard({ summary, finish }: { summary: ChallengeSummary; finish: string }) {
  const pct = summary.postDays ? (summary.posted / summary.postDays) * 100 : 0;
  const toGo = summary.postDays - summary.posted;
  return (
    <div className="flex h-full min-h-[96px] flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-panel px-[18px] py-3.5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[11px] text-text-2">Finish line · {dayLabel(finish, { weekday: false })}</span>
        <span className="font-display text-[20px] font-medium tracking-[-0.03em] text-text">Challenge badge</span>
        <div
          role="progressbar"
          aria-label="Challenge posts"
          aria-valuemin={0}
          aria-valuemax={summary.postDays}
          aria-valuenow={summary.posted}
          className="h-1.5 w-[220px] max-w-full overflow-hidden rounded-pill bg-line"
        >
          <div className="h-full rounded-pill bg-accent-text" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-display text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums text-text">{summary.bestStreak}</span>
        <span className="text-[11px] text-text-2">best streak · {toGo} to go</span>
      </div>
    </div>
  );
}

function EndChallenge({ onEnd, busy }: { onEnd: () => void; busy: boolean }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" className="px-2 text-text-3" disabled={busy}>
          End challenge
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlayClass} />
        <AlertDialog.Content className={`${dialogContentClass} max-w-md`}>
          <AlertDialog.Title className={dialogTitleClass}>End this challenge?</AlertDialog.Title>
          <AlertDialog.Description className={dialogDescriptionClass}>
            You'll see a summary of how it went. Your posts stay where they are, and you can start a new challenge any time.
          </AlertDialog.Description>
          <div className={dialogActionsClass}>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">Keep going</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onEnd}>
                End challenge
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
