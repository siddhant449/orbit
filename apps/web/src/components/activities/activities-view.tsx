"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { CalendarCheck, Flame, FolderPlus, Layers, LayoutTemplate, Lightbulb, Medal, PenLine, Trophy, type LucideIcon } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@brandloop/ui/icons";
import { dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "@/components/dialog-classes";
import type { BadgeProgress } from "@/lib/progress/badges";
import type { ChecklistItem } from "@/lib/progress/activity";
import { dayLabel, mondayOf, addDays, weekdayOf, type DayKey } from "@/lib/progress/days";
import { isLastDayOfWeek, type GoalDto } from "@/lib/progress/goals";
import { dayProgress, tasksForDate, type DoneLike, type TaskLike } from "@/lib/progress/tasks";
import { GoalsPanel, type Tally } from "./goals-panel";
import { TaskDialog } from "./task-dialog";
import { TodoPanel, useTodos, type Todos } from "./todo-panel";

const rise = (i: number) => ({ "--rise-delay": `${i * 80}ms` }) as CSSProperties;
/** How far back the strip goes; matches the done marks the page reads (about 12 weeks). */
const MAX_WEEKS_BACK = 12;

const BADGE_ICON: Record<string, LucideIcon> = {
  "first-post": PenLine,
  "posts-5": Layers,
  "posts-10": Layers,
  "posts-25": Trophy,
  "first-full-week": CalendarCheck,
  "streak-4": Flame,
  "challenge-finished": Medal,
  "first-template": LayoutTemplate,
  "first-space": FolderPlus,
  "ideas-drafted-10": Lightbulb,
};

export type ActivitiesProps = {
  today: DayKey;
  /** Posts marked as posted in the current Monday-first week. */
  weekPosted: number;
  /** Weeks in a row the posts goal was met (this week included once met). */
  streak: number;
  goal: GoalDto;
  tally: Tally;
  tasks: TaskLike[];
  dones: DoneLike[];
  badges: BadgeProgress[];
  checklist: { items: ChecklistItem[]; done: number };
  resets: string;
  postedToday: boolean;
  /** Where "Write" goes: today's challenge day when one is running, else home. */
  postHref: string;
};

/** Activities (screens.md B8): streak, weekly goals, badges, the week strip, getting started and today's to-dos. */
export function ActivitiesView(props: ActivitiesProps) {
  const [goal, setGoal] = useState(props.goal);
  const [tally, setTally] = useState(props.tally);
  const todos = useTodos(props.tasks, props.dones, props.today);
  const [dialog, setDialog] = useState<{ open: boolean; task?: TaskLike }>({ open: false });
  const addRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex w-full flex-col gap-4 px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <header className="orbit-rise flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-page-title text-text focus-visible:outline-none">Activities</h1>
        <Button ref={addRef} onClick={() => setDialog({ open: true })}>
          + Add activity
        </Button>
      </header>

      <div className="orbit-rise grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3" style={rise(1)}>
        <StreakPanel streak={props.streak} weekPosted={props.weekPosted} goal={goal.posts} today={props.today} />
        <GoalsPanel goal={goal} tally={tally} weekPosted={props.weekPosted} onGoal={setGoal} onTally={setTally} />
        <BadgesPanel badges={props.badges} />
      </div>

      <DayStrip today={props.today} todos={todos} />

      <div className="orbit-rise flex flex-wrap gap-3" style={rise(3)}>
        <ChecklistPanel checklist={props.checklist} />
        <TodoPanel today={props.today} resets={props.resets} todos={todos} postedToday={props.postedToday} postHref={props.postHref} onEdit={(task) => setDialog({ open: true, task })} />
      </div>

      <TaskDialog key={dialog.task?.id ?? "new"} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} task={dialog.task} onSaved={todos.saved}
        returnFocusTo={() => (dialog.task ? document.querySelector<HTMLElement>(`[data-task="${dialog.task.id}"] [aria-label^="Options"]`) : addRef.current)}
      />
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

function StreakPanel({ streak, weekPosted, goal, today }: { streak: number; weekPosted: number; goal: number; today: DayKey }) {
  const filled = Math.min(goal, weekPosted);
  const remaining = Math.max(0, goal - weekPosted);
  const lastDay = isLastDayOfWeek(today) && remaining > 0;
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
          {streak === 1 ? "week" : "weeks"} in a row · {weekPosted} of {goal} posts this week
        </span>
      </p>
      <div role="img" aria-label={`${filled} of ${goal} posts this week`} className="relative flex gap-1.5">
        {Array.from({ length: goal }, (_, i) => (
          <span key={i} className={cn("h-2 flex-1 rounded-pill", i < filled ? "bg-accent-text" : "bg-line-2")} />
        ))}
      </div>
      {lastDay ? (
        <p role="status" className="relative text-[13px] text-text-soft">
          <span className="font-medium text-text">Last day of the week.</span> {remaining} more {remaining === 1 ? "post" : "posts"} to keep your streak going.
        </p>
      ) : (
        <p className="relative text-[13px] text-text-soft">
          {weekPosted >= goal ? "Goal met this week." : "Mark a post as posted to move toward this week's goal."}{" "}
          <span className="text-text-2">The week runs Monday to Sunday.</span>
        </p>
      )}
    </Panel>
  );
}

function Badge({ b, size = 56 }: { b: BadgeProgress; size?: number }) {
  const Icon = BADGE_ICON[b.id] ?? PenLine;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        b.earned ? "border border-accent-text bg-accent-wash text-accent-text" : "border border-dashed border-line-hover text-text-2",
      )}
    >
      <Icon className="size-[18px]" strokeWidth={1.6} />
    </span>
  );
}

function BadgesPanel({ badges }: { badges: BadgeProgress[] }) {
  const next = badges.find((b) => !b.earned);
  return (
    <Panel className="gap-4">
      <PanelHead id="milestones-title" title="Milestones" end={<AllBadges badges={badges} />} />
      <ul aria-labelledby="milestones-title" className="flex flex-wrap gap-2.5">
        {badges.map((b) => (
          <li key={b.id}>
            <Badge b={b} />
            <span className="sr-only">
              {b.label}, {b.earned ? "earned" : `${b.current} of ${b.target}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-text-soft">
        {next ? (
          <>
            Next: <span className="font-medium text-text">{next.label}</span> · {next.target - next.current} to go
          </>
        ) : (
          "Every badge earned."
        )}
      </p>
    </Panel>
  );
}

function AllBadges({ badges }: { badges: BadgeProgress[] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="orbit-transition inline-flex min-h-6 items-center rounded-sm text-[12px] text-text-2 hover:text-text">All badges</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-md`}>
          <Dialog.Title className={dialogTitleClass}>Badges</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>Earned from what you do in Orbit. Once earned, a badge stays.</Dialog.Description>
          <ul className="mt-5 flex flex-col gap-3">
            {badges.map((b) => (
              <li key={b.id} className="flex items-center gap-3.5" data-badge={b.id} data-earned={b.earned}>
                <Badge b={b} size={44} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-text">{b.label}</span>
                  <span className="text-[12px] text-text-2">{b.detail}</span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-text-2">{b.earned ? "Earned" : `Locked · ${b.current} / ${b.target}`}</span>
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

/** The Monday-first week `offset` weeks from this one, with each day's done / total to-dos. */
function DayStrip({ today, todos }: { today: DayKey; todos: Todos }) {
  const [offset, setOffset] = useState(0);
  const monday = addDays(mondayOf(today), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(monday, i);
    const when = key < today ? "past" : key === today ? "today" : "future";
    const progress = when === "future" ? null : dayProgress(tasksForDate(todos.tasks, todos.dones, key, today));
    return { key, when, progress, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayOf(key)]!, date: Number(key.slice(8)) };
  });
  const range = `${dayLabel(days[0]!.key, { weekday: false })} to ${dayLabel(days[6]!.key, { weekday: false })}`;
  const arrow =
    "orbit-transition grid size-9 shrink-0 place-items-center rounded-full border border-line-control text-text hover:border-inverse disabled:cursor-not-allowed disabled:opacity-35 [&_svg]:size-4";
  return (
    <section aria-label={`To-dos, week of ${range}`} className="orbit-rise flex items-center gap-2" style={rise(2)}>
      <button type="button" aria-label="Previous week" className={arrow} disabled={offset <= -MAX_WEEKS_BACK} onClick={() => setOffset((o) => o - 1)}>
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <ol className="grid min-w-0 flex-1 grid-cols-7 gap-1.5 md:gap-2">
        {days.map((d) => {
          const isToday = d.when === "today";
          const counted = d.progress && d.progress.total > 0 ? `${d.progress.done}/${d.progress.total}` : null;
          const label = `${dayLabel(d.key)}${isToday ? ", today" : ""}: ${d.when === "future" ? "upcoming" : counted ? `${d.progress!.done} of ${d.progress!.total} to-dos done` : "no to-dos"}`;
          return (
            <li
              key={d.key}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              data-day={d.key}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-[14px] px-1 py-3 md:px-2",
                isToday ? "bg-accent text-on-accent shadow-[0_10px_30px_rgba(124,138,255,0.25)]" : "border border-line bg-panel",
                d.when === "future" ? "text-text-3" : !isToday && "text-text",
              )}
            >
              <span aria-hidden="true" className={cn("text-[11px]", isToday ? "font-medium" : "text-text-3")}>
                {isToday ? "Today" : d.weekday}
              </span>
              <span aria-hidden="true" className="font-display text-[18px] font-medium tracking-[-0.03em] tabular-nums md:text-[20px]">
                {d.date}
              </span>
              <span aria-hidden="true" data-strip-count className={cn("flex h-[14px] items-center text-[11px] tabular-nums", isToday && "font-medium")}>
                {d.when === "future" ? "—" : (counted ?? "·")}
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
              <Link href={item.href} className="orbit-transition inline-flex min-h-6 shrink-0 items-center rounded-sm text-[12px] text-text-2 hover:text-text">
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
