"use client";

import Link from "next/link";
import { excerpt, relativeTime, type PostRow } from "./posts-view";
import { postHref } from "./shared";

const fullDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );

/**
 * List (screens.md B5, no artboard): one panel of rows on the board's card register, last edited first. Status,
 * version and last edit sit in fixed columns from `md`; on a phone they fold under the title.
 */
export function List({ posts, now, timeZone, filtered }: { posts: PostRow[]; now: Date; timeZone: string; filtered: boolean }) {
  return (
    <div className="px-5 pb-16 pt-1 md:px-8">
      <section aria-labelledby="list-heading" className="orbit-panel orbit-rise overflow-hidden p-0" style={{ maxWidth: 1120 }}>
        <h2 id="list-heading" className="sr-only">
          All posts
        </h2>
        <div
          aria-hidden="true"
          className="grid grid-cols-[minmax(0,1fr)_88px_64px_120px] gap-4 border-b border-line px-5 py-3 text-[11px] text-text-3 max-md:hidden"
        >
          <span>Post</span>
          <span>Status</span>
          <span>Version</span>
          <span className="text-right">Last edited</span>
        </div>
        {posts.length === 0 ? (
          <p className="px-5 py-8 text-[13px] text-text-2">
            {filtered ? "No posts match your search." : "No posts yet. Start one from New post and it will appear here."}
          </p>
        ) : (
          <ul>
            {posts.map((p) => {
              const line = excerpt(p.text, p.title, 160);
              return (
                <li key={p.id} className="border-b border-line-row last:border-b-0">
                  <Link
                    href={postHref(p.chatId)}
                    className="orbit-transition grid gap-x-4 gap-y-1.5 px-5 py-4 hover:bg-panel-hover md:grid-cols-[minmax(0,1fr)_88px_64px_120px] md:items-center"
                  >
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-[14px] font-medium text-text">{p.title}</span>
                      {line && <span className="truncate text-[13px] text-text-2">{line}</span>}
                    </span>
                    <span className="flex items-center gap-3 text-[12px] text-text-3 md:contents">
                      <span className="md:text-[12px] md:text-text-soft">Draft</span>
                      <span className="font-mono text-[12px] tracking-[0.04em] md:text-text-2">
                        <span className="sr-only">Version </span>v{p.version}
                      </span>
                      <span className="md:text-right md:text-text-2" title={fullDate(p.updatedAt, timeZone)}>
                        <span className="sr-only">Edited </span>
                        {relativeTime(p.updatedAt, now)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
