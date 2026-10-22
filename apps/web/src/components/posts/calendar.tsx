"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@brandloop/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "@brandloop/ui/icons";
import {
  agendaPlanHour,
  hourLabel,
  moveSlot,
  placeByLastEdit,
  planHref,
  relativeTime,
  slotIsPlannable,
  slotKey,
  zonedParts,
  type PostRow,
  type Slot,
  type WeekDay,
} from "./posts-view";
import { postHref } from "./shared";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const ROW = 64;
const FIRST_VISIBLE_HOUR = 7;
/** Today's column wash (Orbit `accent-wash .03`, header `.06`). */
const todayCell = "bg-[color-mix(in_srgb,var(--accent-text)_3%,transparent)]";
const todayHead = "bg-[color-mix(in_srgb,var(--accent-text)_6%,transparent)]";

const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayName = (iso: string) => longDay.format(new Date(`${iso}T00:00:00Z`));

function editedAt(p: PostRow, timeZone: string) {
  const { hour, minute } = zonedParts(new Date(p.updatedAt), timeZone);
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

/** Week controls (p15): month and year, previous / Today / next. */
export function WeekNav({
  month,
  year,
  onPrev,
  onToday,
  onNext,
}: {
  month: string;
  year: string;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
}) {
  const nav =
    "orbit-transition grid h-8 place-items-center rounded-pill border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse";
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <p
        aria-live="polite"
        className="font-display text-[20px] font-medium tracking-[-0.02em] text-text [font-variation-settings:'opsz'_32,'wdth'_90]"
      >
        {month} <span className="text-text-3">{year}</span>
      </p>
      <div className="inline-flex gap-1">
        <button type="button" aria-label="Previous week" onClick={onPrev} className={cn(nav, "w-[34px]")}>
          <ChevronLeftIcon size={14} />
        </button>
        <button type="button" onClick={onToday} className={cn(nav, "px-3 text-[12px]")}>
          Today
        </button>
        <button type="button" aria-label="Next week" onClick={onNext} className={cn(nav, "w-[34px]")}>
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Week calendar (p15 / p28). Nothing is scheduled yet, so posts sit at the hour they were last edited, labelled as
 * such; every open slot that hasn't ended offers "Plan a post", which opens a new draft with the date in the prompt.
 * The grid is one tab stop: arrows move by hour and day, Page Up / Down by six hours, Home / End to Monday / Sunday.
 */
export function Calendar({
  posts,
  days,
  todayISO,
  now,
  timeZone,
  onShowAll,
}: {
  posts: PostRow[];
  days: WeekDay[];
  todayISO: string;
  now: Date;
  timeZone: string;
  onShowAll: () => void;
}) {
  const placed = placeByLastEdit(posts, days, timeZone);
  const todayIndex = days.findIndex((d) => d.iso === todayISO);
  const nowHour = zonedParts(now, timeZone).hour;
  const [active, setActive] = useState<Slot>({ day: Math.max(0, todayIndex), hour: todayIndex >= 0 ? nowHour : 9 });
  const scroller = useRef<HTMLDivElement>(null);

  // Open on the working day (7:00), or earlier when a post this week was edited before then.
  const firstHour = Math.min(FIRST_VISIBLE_HOUR, ...[...placed.keys()].map((k) => Number(k.split("|")[1])));
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = firstHour * ROW;
  }, [firstHour]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = moveSlot(active, e.key);
    if (!next) return;
    e.preventDefault();
    setActive(next);
    scroller.current?.querySelector<HTMLElement>(`[data-slot="${next.day}-${next.hour}"]`)?.focus();
  }

  const shown = posts.slice(0, 6);

  return (
    <div className="flex flex-col gap-2.5 px-5 pb-7 md:px-7">
      <p id="calendar-note" className="text-[12px] leading-[1.5] text-text-3">
        Posts sit at the hour they were last edited; scheduled times arrive with LinkedIn publishing. Pick any open slot to
        plan a post for it.
      </p>
      <div className="flex min-h-0 gap-3.5 max-lg:flex-col">
        {/* Desktop and tablet: the 7-day grid. */}
        <div className="orbit-panel orbit-rise flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] p-0 max-md:hidden" style={{ "--rise-delay": "80ms" } as React.CSSProperties}>
          <div
            ref={scroller}
            role="grid"
            aria-label={`Week of ${dayName(days[0]!.iso)}`}
            aria-describedby="calendar-note"
            onKeyDown={onKeyDown}
            className="h-[max(420px,calc(100dvh-230px))] overflow-y-auto overscroll-contain"
          >
            <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
              <div role="row" className="contents">
                <div role="columnheader" className="sticky top-0 z-10 border-b border-line bg-panel">
                  <span className="sr-only">Time</span>
                </div>
                {days.map((d, i) => (
                  <div
                    key={d.iso}
                    role="columnheader"
                    aria-label={`${dayName(d.iso)}${i === todayIndex ? ", today" : ""}`}
                    className={cn(
                      "sticky top-0 z-10 flex items-baseline gap-1.5 border-b border-line bg-panel p-3 text-[12px]",
                      i === todayIndex ? "text-accent-text" : "text-text-2",
                    )}
                  >
                    <span aria-hidden="true" className={cn("absolute inset-0", i === todayIndex && todayHead)} />
                    <span aria-hidden="true" className="relative">
                      {d.weekday}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn("relative font-display text-[18px] font-medium", i === todayIndex ? "text-accent-text" : "text-text")}
                    >
                      {d.day}
                    </span>
                    {i === todayIndex && (
                      <span aria-hidden="true" className="relative ml-1 rounded-pill bg-accent px-[7px] py-0.5 text-[10px] font-medium text-on-accent max-lg:hidden">
                        Today
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {HOURS.map((h) => (
                <div key={h} role="row" className="contents">
                  <div role="rowheader" className="border-b border-line-faint px-2.5 py-1.5 text-[11px] text-text-3" style={{ height: ROW }}>
                    {hourLabel(h)}
                  </div>
                  {days.map((d, i) => {
                    const here = placed.get(slotKey(d.iso, h)) ?? [];
                    const plannable = here.length === 0 && slotIsPlannable(d.iso, h, now, timeZone);
                    const isActive = active.day === i && active.hour === h;
                    const slotProps = {
                      "data-slot": `${i}-${h}`,
                      tabIndex: isActive ? 0 : -1,
                      onFocus: () => setActive({ day: i, hour: h }),
                    };
                    const where = `${dayName(d.iso)}, ${hourLabel(h)}`;
                    return (
                      <div
                        key={d.iso}
                        role="gridcell"
                        className={cn("group relative border-b border-l border-line-faint p-1", i === todayIndex && todayCell)}
                        style={{ height: ROW }}
                      >
                        {here.length > 0 ? (
                          <Link
                            {...slotProps}
                            href={postHref(here[here.length - 1]!.chatId)}
                            className="orbit-transition flex h-full flex-col gap-0.5 overflow-hidden rounded-[10px] border border-line-3 bg-panel-hover px-2.5 py-1.5 text-text hover:border-line-hover"
                          >
                            <span className="truncate text-[10px] text-text-3">
                              Last edited · {editedAt(here[here.length - 1]!, timeZone)}
                              {here.length > 1 && (
                                <>
                                  {` · +${here.length - 1}`}
                                  <span className="sr-only"> more edited this hour, listed under Drafts</span>
                                </>
                              )}
                              <span className="sr-only">, {dayName(d.iso)}</span>
                            </span>
                            <span className="line-clamp-2 text-[12px] font-medium leading-[1.3]">{here[here.length - 1]!.title}</span>
                          </Link>
                        ) : plannable ? (
                          <Link
                            {...slotProps}
                            href={planHref(d.iso, h, timeZone)}
                            aria-label={`Plan a post for ${where}`}
                            className="orbit-transition flex h-full items-center justify-center rounded-[10px] border border-dashed border-accent-wash-line text-[11px] text-accent-text-2 opacity-0 hover:opacity-100 focus-visible:opacity-100"
                          >
                            Plan a post
                          </Link>
                        ) : (
                          <div {...slotProps} className="h-full rounded-[10px]">
                            <span className="sr-only">{where}, past</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Phone: one block per day, a plan link each. */}
        <ol className="flex flex-col gap-2.5 md:hidden" aria-label={`Week of ${dayName(days[0]!.iso)}`}>
          {days.map((d, i) => {
            const dayPosts = HOURS.flatMap((h) => placed.get(slotKey(d.iso, h)) ?? []);
            const planHour = agendaPlanHour(d.iso, now, timeZone);
            return (
              <li key={d.iso} className={cn("orbit-panel rounded-card-sm p-4", i === todayIndex && "border-accent-wash-line")}>
                <h3 className="flex items-baseline gap-1.5 text-[12px] text-text-2">
                  {d.weekday} <span className="font-display text-[18px] font-medium text-text">{d.day}</span>
                  {i === todayIndex && (
                    <span className="ml-1 rounded-pill bg-accent px-[7px] py-0.5 text-[10px] font-medium text-on-accent">Today</span>
                  )}
                </h3>
                {dayPosts.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {dayPosts.map((p) => (
                      <li key={p.id}>
                        <Link href={postHref(p.chatId)} className="flex flex-col gap-0.5 rounded-[10px] bg-panel-hover px-3 py-2">
                          <span className="text-[11px] text-text-3">Last edited · {editedAt(p, timeZone)}</span>
                          <span className="text-[13px] font-medium text-text">{p.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {planHour !== null && (
                  <Link
                    href={planHref(d.iso, planHour, timeZone)}
                    className="mt-2.5 flex min-h-10 items-center justify-center rounded-[10px] border border-dashed border-accent-wash-line text-[12px] text-accent-text-2"
                  >
                    Plan a post · {hourLabel(planHour)}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>

        {/* Drafts rail (p15 right panel, 270 px). */}
        <aside
          aria-labelledby="drafts-heading"
          className="orbit-panel orbit-rise flex min-w-0 shrink-0 flex-col overflow-hidden rounded-[20px] p-0 lg:w-[270px]"
          style={{ "--rise-delay": "160ms" } as React.CSSProperties}
        >
          <div className="flex items-center justify-between gap-3 px-[18px] pb-2.5 pt-4">
            <h2 id="drafts-heading" className="text-[14px] font-medium text-text">
              Drafts <span className="font-normal text-text-3">{posts.length}</span>
            </h2>
            <span className="text-[11px] text-text-3">Scheduling comes with LinkedIn</span>
          </div>
          {posts.length === 0 ? (
            <p className="px-[18px] pb-5 text-[13px] leading-[1.5] text-text-2">No drafts yet. Plan a post on any open slot to start one.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 px-2.5 pb-2">
              {shown.map((p) => (
                <li key={p.id}>
                  <Link
                    href={postHref(p.chatId)}
                    className="orbit-transition flex flex-col gap-[5px] rounded-[12px] bg-panel-hover p-3 text-text hover:bg-line-3"
                  >
                    <span className="text-[13px] font-medium leading-[1.3]">{p.title}</span>
                    <span className="text-[11px] text-text-3">Edited {relativeTime(p.updatedAt, now).toLowerCase()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {posts.length > shown.length && (
            <button
              type="button"
              onClick={onShowAll}
              className="mx-3.5 mb-3 self-start rounded-pill px-1 py-2 text-left text-[12px] text-text-3 hover:text-text"
            >
              {posts.length - shown.length} more drafts
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
