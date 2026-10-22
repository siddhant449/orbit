"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { CalendarCheck, Flame, Layers, PenLine, type LucideIcon } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@brandloop/ui/icons";
import { dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "@/components/dialog-classes";
import { nextMilestone, weekStrip, type ChecklistItem, type DraftsByDay, type Milestone, type MilestoneId } from "@/lib/progress/activity";
import { dayLabel, type DayKey } from "@/lib/progress/days";
import { sprintDraftHref } from "@/lib/sprint/links";

const rise = (i: number) => ({ "--rise-delay": `${i * 80}ms` }) as CSSProperties;
const WEEK_GOAL = 5;
/** How far back the strip goes; matches the draft history the page reads. */
const MAX_WEEKS_BACK = 52;

const BADGE_ICON: Record<MilestoneId, LucideIcon> = {
  "first-draft": PenLine,
  "streak-3": Flame,
  "full-week": CalendarCheck,
  "ten-drafts": Layers,
};

const LINKEDIN_NOTE = "Counted once LinkedIn is connected in Settings → Integrations.";

export type ActivitiesProps = {
  today: DayKey;
  drafts: DraftsByDay;
  streak: number;
  weekDrafts: number;
  milestones: Milestone[];
  checklist: { items: ChecklistItem[]; done: number };
  resets: string;
  todayFormat: { id: string; title: string } | null;
};

/** Activities (screens.md B8): three summary panels, the week strip, getting started and today's routine. */
export function ActivitiesView(props: ActivitiesProps) {
  return (
    <div className="flex w-full max-w-[1240px] flex-col gap-4 px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <header className="orbit-rise flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-page-title text-text focus-visible:outline-none">Activities</h1>
        <Button aria-disabled="true" aria-describedby="add-activity-note" onClick={(e) => e.preventDefault()}>
          Add activity
        </Button>
        <span id="add-activity-note" className="sr-only">
          Custom activities arrive once routines are saved to your account.
        </span>
      </header>

      <div className="orbit-rise grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3" style={rise(1)}>
        <StreakPanel streak={props.streak} weekDrafts={props.weekDrafts} />
        <GoalsPanel weekDrafts={props.weekDrafts} />
        <MilestonesPanel milestones={props.milestones} />
      </div>

      <DayStrip today={props.today} drafts={props.drafts} />

      <div className="orbit-rise flex flex-wrap gap-3" style={rise(3)}>
        <ChecklistPanel checklist={props.checklist} />
        <TodayPanel {...props} />
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("orbit-panel relative flex flex-col overflow-hidden !rounded-[20px] p-6", className)}>{children}</section>;
}

function PanelHead({ title, id, end }: { title: string; id: string; end?: ReactNode }) {
  return (
    <div className="relative flex items-center justify-between gap-3">
      <h2 id={id} className="text-[13px] font-normal text-text-2">
        {title}
      </h2>
      {end}
    </div>
  );
}

function StreakPanel({ streak, weekDrafts }: { streak: number; weekDrafts: number }) {
  const filled = Math.min(WEEK_GOAL, weekDrafts);
  return (
    <Panel className="gap-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(260px_160px_at_90%_10%,color-mix(in_srgb,var(--accent-text)_16%,transparent),transparent_70%)]"
      />
      <PanelHead id="streak-title" title="Streak" />
      <p className="relative flex flex-wrap items-baseline gap-x-2.5 gap-y-1" aria-describedby="streak-title">
        <span className="font-display text-[72px] font-medium leading-[0.9] tracking-[-0.045em] tabular-nums text-text [font-variation-settings:'opsz'_96,'wdth'_85]">
          {streak}
        </span>
        <span className="text-[14px] text-text-2">
          day streak · {weekDrafts} of {WEEK_GOAL} drafts this week
        </span>
      </p>
      <div role="img" aria-label={`${filled} of ${WEEK_GOAL} drafts this week`} className="relative flex gap-1.5">
        {Array.from({ length: WEEK_GOAL }, (_, i) => (
          <span key={i} className={cn("h-2 flex-1 rounded-pill", i < filled ? "bg-accent-text" : "bg-line-2")} />
        ))}
      </div>
      <p className="relative text-[13px] text-text-soft">
        {streak > 0 ? "Start a draft on the next weekday to keep it going." : "Start a draft today to begin a streak."}{" "}
        <span className="text-text-3">Weekends never break it.</span>
      </p>
    </Panel>
  );
}

function GoalRow({ label, value, max }: { label: string; value: number | null; max: number }) {
  const pct = value === null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-[13px]">
        <span className="font-medium text-text">{label}</span>
        <span className="tabular-nums text-text-2">{value === null ? "Not tracked yet" : `${value} / ${max}`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "Not tracked yet" : `${value} of ${max}`}
        className="h-1.5 overflow-hidden rounded-pill bg-line"
      >
        <div className="h-full rounded-pill bg-accent-text" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function GoalsPanel({ weekDrafts }: { weekDrafts: number }) {
  return (
    <Panel className="gap-3.5">
      <PanelHead
        id="goals-title"
        title="This week's goals"
        end={
          <button
            type="button"
            aria-disabled="true"
            title="Goals become editable once they're saved to your account"
            className="cursor-not-allowed text-[12px] text-text-3"
          >
            Edit
          </button>
        }
      />
      <ul aria-labelledby="goals-title" className="flex flex-col gap-3">
        <GoalRow label={`Draft ${WEEK_GOAL} posts`} value={weekDrafts} max={WEEK_GOAL} />
        <GoalRow label="50 comments" value={null} max={50} />
        <GoalRow label="10 DMs" value={null} max={10} />
        <GoalRow label="50 connection requests" value={null} max={50} />
      </ul>
      <p className="text-[11px] leading-[1.5] text-text-3">
        Drafts are posts you start in Orbit. Comments, DMs and connection requests are counted once LinkedIn is connected.
      </p>
    </Panel>
  );
}

function Badge({ m, size = 56 }: { m: Milestone; size?: number }) {
  const Icon = BADGE_ICON[m.id];
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        m.earned ? "border border-accent-text bg-accent-wash text-accent-text" : "border border-dashed border-line-hover text-text-2",
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.6} />
    </span>
  );
}

function MilestonesPanel({ milestones }: { milestones: Milestone[] }) {
  const next = nextMilestone(milestones);
  return (
    <Panel className="gap-4">
      <PanelHead id="milestones-title" title="Milestones" end={<AllBadges milestones={milestones} />} />
      <ul aria-labelledby="milestones-title" className="flex flex-wrap gap-2.5">
        {milestones.map((m) => (
          <li key={m.id}>
            <Badge m={m} />
            <span className="sr-only">
              {m.title}, {m.earned ? "earned" : `${m.current} of ${m.target}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-text-soft">
        {next ? (
          <>
            Next: <span className="font-medium text-text">{next.title}</span> · {next.toGo} to go
          </>
        ) : (
          "Every badge earned."
        )}
      </p>
    </Panel>
  );
}

function AllBadges({ milestones }: { milestones: Milestone[] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="orbit-transition rounded-sm text-[12px] text-text-2 hover:text-text">All badges</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-md`}>
          <Dialog.Title className={dialogTitleClass}>Badges</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>Earned from the drafts you start in Orbit.</Dialog.Description>
          <ul className="mt-5 flex flex-col gap-3">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3.5">
                <Badge m={m} size={44} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-text">{m.title}</span>
                  <span className="text-[12px] text-text-2">{m.detail}</span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-text-2">{m.earned ? "Earned" : `${m.current} / ${m.target}`}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="ghost">Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DayStrip({ today, drafts }: { today: DayKey; drafts: DraftsByDay }) {
  const [offset, setOffset] = useState(0);
  const days = weekStrip(drafts, today, offset);
  const range = `${dayLabel(days[0]!.key, { weekday: false })} to ${dayLabel(days[6]!.key, { weekday: false })}`;
  const arrow =
    "orbit-transition grid size-9 shrink-0 place-items-center rounded-full border border-line-control text-text hover:border-inverse disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-4";
  return (
    <section aria-label={`Drafts, week of ${range}`} className="orbit-rise flex items-center gap-2" style={rise(2)}>
      <button type="button" aria-label="Previous week" className={arrow} disabled={offset <= -MAX_WEEKS_BACK} onClick={() => setOffset((o) => o - 1)}>
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <ol className="grid min-w-0 flex-1 grid-cols-7 gap-1.5 md:gap-2">
        {days.map((d) => {
          const isToday = d.when === "today";
          const label = `${dayLabel(d.key)}${isToday ? ", today" : ""}: ${d.when === "future" ? "upcoming" : `${d.drafts} ${d.drafts === 1 ? "draft" : "drafts"}`}`;
          return (
            <li
              key={d.key}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-[14px] px-1 py-3 md:px-2",
                isToday
                  ? "bg-accent text-on-accent shadow-[0_10px_30px_rgba(124,138,255,0.25)]"
                  : "border border-line bg-panel",
                d.when === "future" ? "text-text-3" : !isToday && "text-text",
              )}
            >
              <span aria-hidden="true" className={cn("text-[11px]", isToday ? "font-medium" : "text-text-3")}>
                {isToday ? "Today" : d.weekday}
              </span>
              <span aria-hidden="true" className="font-display text-[18px] font-medium tracking-[-0.03em] tabular-nums md:text-[20px]">
                {d.date}
              </span>
              <span aria-hidden="true" className="flex h-[14px] items-center text-[11px]">
                {isToday ? (
                  <span className="font-medium tabular-nums">
                    {d.drafts}
                    <span className="max-md:hidden"> {d.drafts === 1 ? "draft" : "drafts"}</span>
                  </span>
                ) : d.when === "future" ? (
                  "—"
                ) : d.drafts > 0 ? (
                  <span className="block size-[5px] rounded-full bg-accent-text" />
                ) : (
                  <span className="block size-[5px] rounded-full border border-text-2" />
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <button type="button" aria-label="Next week" className={arrow} disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
        <ChevronRightIcon aria-hidden="true" />
      </button>
    </section>
  );
}

function CheckCircle({ done, muted }: { done: boolean; muted?: boolean }) {
  return done ? (
    <span aria-hidden="true" className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent-text text-on-accent">
      <CheckIcon className="size-3" />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={cn("block size-[18px] shrink-0 rounded-full border", muted ? "border-dashed border-line-hover" : "border-text-2")}
    />
  );
}

function ChecklistPanel({ checklist }: { checklist: { items: ChecklistItem[]; done: number } }) {
  const total = checklist.items.length;
  const firstOpen = checklist.items.find((i) => !i.done)?.id;
  return (
    <section aria-labelledby="checklist-title" className="orbit-panel flex min-w-0 flex-[1_1_420px] flex-col gap-0.5 !rounded-[20px] px-2.5 py-3">
      <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-2">
        <h2 id="checklist-title" className="text-[14px] font-medium text-text">
          Getting started{" "}
          <span className="font-normal text-text-2">
            {checklist.done} of {total}
          </span>
        </h2>
        <div
          role="progressbar"
          aria-label="Getting started"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={checklist.done}
          className="h-1.5 w-[120px] overflow-hidden rounded-pill bg-line"
        >
          <div className="h-full rounded-pill bg-accent-text" style={{ width: `${(checklist.done / total) * 100}%` }} />
        </div>
      </div>
      <ul className="flex flex-col gap-0.5">
        {checklist.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-[12px] px-3 py-2.5">
            <CheckCircle done={item.done} />
            {item.done ? (
              <span className="flex-1 text-[14px] text-text-3 line-through">
                {item.title}
                <span className="sr-only"> (done)</span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-medium text-text">{item.title}</span>
                <span className="text-[12px] text-text-2">{item.detail}</span>
              </span>
            )}
            {item.done ? (
              <Link href={item.href} className="orbit-transition shrink-0 rounded-sm text-[12px] text-text-2 hover:text-text">
                Open
              </Link>
            ) : (
              <Button asChild size="sm" variant={item.id === firstOpen ? "primary" : "secondary"} className="shrink-0 text-[12px]">
                <Link href={item.href}>{item.action}</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodayPanel({ today, drafts, resets, todayFormat }: ActivitiesProps) {
  const draftedToday = (drafts[today] ?? 0) > 0;
  const routines = [
    { title: "Comment on 8 posts", detail: "Thoughtful comments on posts in your field put your name in front of new readers." },
    { title: "Reply to 3 DMs", detail: "Answer the people who already wrote to you. Conversations turn into work." },
    { title: "Send 10 connection requests", detail: "Grow the audience that sees your posts, a few people a day." },
  ];
  return (
    <section aria-labelledby="today-title" className="orbit-panel flex min-w-0 flex-[1_1_420px] flex-col gap-1 !rounded-[20px] px-2.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pb-2.5 pt-2">
        <h2 id="today-title" className="text-[14px] font-medium text-text">
          Today <span className="font-normal text-text-2">{dayLabel(today)}</span>
        </h2>
        <span className="text-[12px] text-text-2">
          {draftedToday ? "Done for today" : "1 left"} · {resets}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        <li className="flex items-center gap-3 rounded-[12px] px-3 py-2.5">
          <CheckCircle done={draftedToday} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn("text-[14px] font-medium", draftedToday ? "text-text-3 line-through" : "text-text")}>
              Draft today&apos;s post
              {draftedToday && <span className="sr-only"> (done)</span>}
            </span>
            <span className="text-[12px] text-text-2">
              {todayFormat
                ? `Try the sprint's opening format, ${todayFormat.title.replace(/^The /, "the ")}. Orbit drafts it with you.`
                : "Drafting on the days you plan keeps the streak alive. Orbit drafts it with you."}
            </span>
          </span>
          <Button asChild size="sm" variant={draftedToday ? "secondary" : "primary"} className="shrink-0 text-[12px]">
            <Link href={todayFormat ? sprintDraftHref(todayFormat.id) : "/"}>{draftedToday ? "Draft another" : "Draft"}</Link>
          </Button>
        </li>
        {routines.map((r) => (
          <li key={r.title} className="flex items-start gap-3 rounded-[12px] px-3 py-2.5">
            <span className="mt-0.5">
              <CheckCircle done={false} muted />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-medium text-text">{r.title}</span>
              <span className="text-[12px] text-text-2">{r.detail}</span>
              <span className="text-[11px] text-text-3">{LINKEDIN_NOTE}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
