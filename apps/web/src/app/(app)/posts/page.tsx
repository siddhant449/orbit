import Link from "next/link";
import { listDocuments } from "@brandloop/db";
import { POST_CHAR_LIMIT } from "@brandloop/agent/client";
import { Button } from "@brandloop/ui";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Posts" };

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/**
 * Posts (screens.md B5, minimal until O6b): the profile's posts, most recently changed first; each opens in the
 * editor. The board, list and calendar views come later.
 */
export default async function Page() {
  const { currentProfile: profile } = await getAccount();
  const posts = profile ? await listDocuments(profile.id) : [];
  return (
    <>
      <PageHeader
        title="Posts"
        subtitle="Every post Orbit has drafted for this profile. Open one to edit it with Orbit beside you."
        actions={
          <Button asChild size="md">
            <Link href="/">New post</Link>
          </Button>
        }
      />
      <PageBody>
        {posts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            body="Ask Orbit for a post on the home screen. Each draft lands here, ready to edit."
            action={
              <Button asChild variant="secondary" size="md">
                <Link href="/">Start a draft</Link>
              </Button>
            }
          />
        ) : (
          <ul aria-label="Posts" className="flex flex-col border-t border-line">
            {posts.map((p) => {
              const first = p.text.split("\n").find((l) => l.trim())?.trim() ?? "";
              return (
                <li key={p.id} className="border-b border-line">
                  <Link
                    href={`/posts/${encodeURIComponent(p.id)}`}
                    data-post-row={p.id}
                    className="orbit-transition group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 py-4 hover:bg-line-soft focus-visible:-outline-offset-2 sm:px-3"
                  >
                    <span className="truncate text-[15px] font-medium text-text">{p.title}</span>
                    <span className="text-[13px] tabular-nums text-text-3">{dateFmt.format(p.updatedAt)}</span>
                    <span className="truncate text-[14px] text-text-2">{first}</span>
                    <span className="text-[13px] tabular-nums text-text-3">
                      Draft · {p.text.length.toLocaleString("en-US")} / {POST_CHAR_LIMIT.toLocaleString("en-US")}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
