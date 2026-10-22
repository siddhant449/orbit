"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { StatusPill, cn } from "@brandloop/ui";
import { PlusIcon } from "@brandloop/ui/icons";
import { boardColumns, excerpt, relativeTime, type ColumnId, type PostRow } from "./posts-view";
import { postHref } from "./shared";

const IDEAS_PROMPT = "Give me five post ideas for this week based on my strategy.";

/** Column header dots (screens.md B5): all `text`, ideas `accent-text`, draft `faint`, scheduled `cobalt`, published `faint`. */
const dot: Record<ColumnId, string> = {
  all: "bg-text",
  ideas: "bg-accent-text",
  draft: "bg-faint",
  scheduled: "bg-cobalt",
  published: "bg-faint",
};

/** Where a column's "+" starts a post. Scheduled and Published can't take one until scheduling exists. */
const addHref: Partial<Record<ColumnId, { href: string; label: string }>> = {
  all: { href: "/", label: "New post" },
  ideas: { href: `/?prompt=${encodeURIComponent(IDEAS_PROMPT)}`, label: "Find ideas with Orbit" },
  draft: { href: "/", label: "New draft" },
};

const rise = (i: number) => ({ "--rise-delay": `${i * 120}ms` }) as CSSProperties;

/**
 * Board (p08 / p21): 272 px columns, 16 px apart, scrolling sideways inside the board only. Every card is a draft, so
 * cards don't drag: there is no saved status to move them to until scheduling and ideas exist.
 */
export function Board({ posts, now, filtered }: { posts: PostRow[]; now: Date; filtered: boolean }) {
  const columns = boardColumns(posts);
  return (
    <div
      role="region"
      aria-label="Board columns"
      tabIndex={0}
      className="min-w-0 overflow-x-auto overscroll-x-contain px-5 pb-7 pt-1 focus-visible:outline-offset-[-2px] md:px-8"
    >
      <div className="flex w-max min-h-[min(620px,70vh)] gap-4 max-md:snap-x max-md:snap-mandatory">
        {columns.map((col, i) => (
          <section
            key={col.id}
            aria-labelledby={`col-${col.id}`}
            className="orbit-rise flex w-[272px] shrink-0 snap-start flex-col gap-2.5 max-md:w-[min(272px,calc(100vw-56px))]"
            style={rise(i)}
          >
            <div className="flex min-h-[38px] items-center justify-between py-1.5 pl-2.5 pr-1.5">
              <h2 id={`col-${col.id}`} className="flex items-center gap-2 text-[13px] font-medium text-text">
                <span aria-hidden="true" className={cn("size-[7px] rounded-full", dot[col.id])} />
                {col.label} <span className="font-normal text-text-3">{col.posts.length}</span>
              </h2>
              {addHref[col.id] && (
                <Link
                  href={addHref[col.id]!.href}
                  aria-label={addHref[col.id]!.label}
                  title={addHref[col.id]!.label}
                  className="orbit-transition grid size-[26px] place-items-center rounded-full border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse"
                >
                  <PlusIcon size={12} />
                </Link>
              )}
            </div>
            <Column id={col.id} posts={col.posts} now={now} filtered={filtered} />
          </section>
        ))}
      </div>
    </div>
  );
}

function Column({ id, posts, now, filtered }: { id: ColumnId; posts: PostRow[]; now: Date; filtered: boolean }) {
  if (id === "ideas")
    return (
      <Empty title="No saved ideas yet" body="Ideas you keep from the Ideas feed will wait here. Until then, ask Orbit for a few.">
        <Link href={addHref.ideas!.href} className="text-[12px] font-medium text-accent-text underline-offset-4 hover:underline">
          Find ideas
        </Link>
      </Empty>
    );
  if (id === "scheduled")
    return (
      <Empty
        title="Nothing scheduled"
        body="Scheduling arrives with LinkedIn publishing. Until then every post stays a draft, so cards don't move between columns."
      />
    );
  if (id === "published")
    return <Empty title="Nothing published yet" body="Posts you publish will appear here once LinkedIn is connected." />;
  if (posts.length === 0)
    return filtered ? (
      <p className="px-2.5 py-3 text-[12px] text-text-3">No posts match your search.</p>
    ) : (
      <Link
        href="/"
        className="orbit-transition grid min-h-11 place-items-center rounded-card-sm border border-dashed border-line-control text-[13px] text-text-2 hover:border-inverse hover:text-text"
      >
        Add a post
      </Link>
    );
  return (
    <ul className="flex flex-col gap-2.5">
      {posts.map((p) => (
        <li key={p.id}>
          <PostCard post={p} now={now} showStatus={id === "all"} />
        </li>
      ))}
    </ul>
  );
}

/** `showStatus`: in All posts each card carries its status chip, so its twin in Draft reads as the same post. */
export function PostCard({ post, now, showStatus = false }: { post: PostRow; now: Date; showStatus?: boolean }) {
  const line = excerpt(post.text, post.title);
  return (
    <Link
      href={postHref(post.chatId)}
      className="orbit-panel orbit-panel--interactive flex flex-col gap-2.5 rounded-card-sm p-4 text-text"
    >
      <span className="text-[14px] font-medium leading-[1.3]">{post.title}</span>
      {line && <span className="line-clamp-2 text-[13px] leading-[1.45] text-text-2">{line}</span>}
      <span className="flex items-center justify-between text-[11px] text-text-3">
        {showStatus ? (
          <StatusPill className="min-h-5 px-2 text-[10px]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-faint" />
            Draft
          </StatusPill>
        ) : (
          <span>Draft</span>
        )}
        <span>
          <span className="sr-only">Edited </span>
          {relativeTime(post.updatedAt, now)}
        </span>
      </span>
    </Link>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-card-sm bg-line-faint px-4 py-6 text-center">
      <p className="text-[13px] text-text-2">{title}</p>
      <p className="text-[12px] leading-[1.5] text-text-3">{body}</p>
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
