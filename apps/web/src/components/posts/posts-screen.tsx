"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Segmented } from "@brandloop/ui";
import { SearchIcon } from "@brandloop/ui/icons";
import { Board } from "./board";
import { Calendar, WeekNav } from "./calendar";
import { List } from "./list";
import {
  VIEWS,
  addDays,
  filterPosts,
  gmtLabel,
  monthLabel,
  parseView,
  parseWeek,
  todayIn,
  weekDays,
  type PostRow,
  type PostsView,
} from "./posts-view";
import { LabelsPill, NewPostLink } from "./shared";

/**
 * Posts (screens.md B5 / B6): board, list and week calendar over the profile's real posts. The view and week live in
 * the address (`?view=`, `?week=`), switched in place with the History API so nothing refetches; search is local.
 */
export function PostsScreen({
  posts,
  total,
  timeZone,
  nowISO,
}: {
  posts: PostRow[];
  total: number;
  timeZone: string;
  nowISO: string;
}) {
  const params = useSearchParams();
  const view = parseView(params.get("view") ?? undefined);
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const todayISO = todayIn(now, timeZone);
  const week = parseWeek(params.get("week") ?? undefined, todayISO);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterPosts(posts, query), [posts, query]);
  const filtered = query.trim().length > 0;

  function setParams(next: { view?: PostsView; week?: string | null }) {
    const p = new URLSearchParams(params.toString());
    if (next.view) {
      if (next.view === "board") p.delete("view");
      else p.set("view", next.view);
      if (next.view !== "calendar") p.delete("week");
    }
    if (next.week !== undefined) {
      if (next.week === null) p.delete("week");
      else p.set("week", next.week);
    }
    const qs = p.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const days = weekDays(week);
  const { month, year } = monthLabel(days);
  const search = (
    <div className="flex h-10 min-w-0 items-center gap-2 rounded-pill border border-line-control bg-panel px-3.5 focus-within:border-accent-wash-line max-md:w-full md:w-[280px]">
      <SearchIcon size={15} className="shrink-0 text-text-2" />
      <label htmlFor="post-search" className="sr-only">
        Search posts
      </label>
      <input
        id="post-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search posts"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-3"
      />
    </div>
  );
  const segmented = <Segmented label="View" options={VIEWS} value={view} onChange={(v) => setParams({ view: v })} />;
  const live = filtered ? `${shown.length} of ${posts.length} posts match.` : "";

  return (
    <div className="flex min-w-0 flex-col">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      {view === "calendar" ? (
        <header className="flex flex-wrap items-center justify-between gap-4 px-5 pb-3.5 pt-8 md:px-7 md:pt-6">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <h1 className="type-page-title text-[34px] text-text focus-visible:outline-none">Posts</h1>
            {segmented}
            <WeekNav
              month={month}
              year={year}
              onPrev={() => setParams({ week: addDays(week, -7) })}
              onToday={() => setParams({ week: null })}
              onNext={() => setParams({ week: addDays(week, 7) })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1.5 text-[12px] text-text-3">{gmtLabel(timeZone, new Date(`${days[3]!.iso}T12:00:00Z`))}</span>
            <LabelsPill className="min-h-9" />
            <NewPostLink className="min-h-9 px-4" />
          </div>
        </header>
      ) : (
        <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-8 md:px-8 md:pt-[28px]">
          <div className="flex min-w-0 flex-col gap-3.5 max-md:w-full">
            <h1 className="type-page-title text-text focus-visible:outline-none">
              Posts <span className="text-text-3">{total}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2.5">
              {segmented}
              {search}
              <LabelsPill />
            </div>
          </div>
          <NewPostLink />
        </header>
      )}

      {total > posts.length && view !== "calendar" && (
        <p className="px-5 pb-3 text-[12px] text-text-3 md:px-8">
          Showing the {posts.length} most recently edited posts.
        </p>
      )}

      {view === "board" && <Board posts={shown} now={now} filtered={filtered} />}
      {view === "list" && <List posts={shown} now={now} timeZone={timeZone} filtered={filtered} />}
      {view === "calendar" && (
        <Calendar
          key={week}
          posts={posts}
          days={days}
          todayISO={todayISO}
          now={now}
          timeZone={timeZone}
          onShowAll={() => setParams({ view: "list" })}
        />
      )}
    </div>
  );
}
