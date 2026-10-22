"use client";

import Link from "next/link";
import { useState } from "react";
import useSWRInfinite from "swr/infinite";
import useSWR from "swr";
import { Trash2 } from "lucide-react";
import { Button, StatusPill } from "@brandloop/ui";
import { EmptyState } from "@/components/page";
import { deleteVisual, getCredits, listVisuals, type LibraryItemDto } from "@/lib/visuals-api";

type Page = Awaited<ReturnType<typeof listVisuals>>;

/** The /images library: every image made for this profile, newest first, with credits and delete. */
export function ImageLibrary() {
  const { data, error, size, setSize, isLoading, mutate } = useSWRInfinite<Page>(
    (index, prev) => (prev && !prev.nextCursor ? null : ["visuals", index === 0 ? "" : prev!.nextCursor!]),
    ([, cursor]: [string, string]) => listVisuals({ cursor: cursor || undefined, limit: 24 }),
    { revalidateOnFocus: false },
  );
  const credits = useSWR("credits", () => getCredits(), { revalidateOnFocus: false });
  const [failed, setFailed] = useState<string | null>(null);
  const items: LibraryItemDto[] = data?.flatMap((p) => p.items) ?? [];
  const last = data?.at(-1);

  async function remove(item: LibraryItemDto) {
    setFailed(null);
    try {
      await deleteVisual(item.id);
      await mutate();
    } catch {
      setFailed("Couldn't delete that image. Try again.");
    }
  }

  if (error) return <EmptyState title="Couldn't load your images" body="Reload the page to try again." />;
  if (isLoading) return <p className="text-[14px] text-text-2" role="status">Loading your images…</p>;

  return (
    <div className="flex flex-col gap-5" data-image-library>
      {credits.data && <p className="text-[14px] text-text-2" data-credits>{credits.data.balance} image credits left this month.</p>}
      {failed && <p role="alert" className="text-[13px] text-text-2">{failed}</p>}
      {items.length === 0 ? (
        <EmptyState title="No images yet" body="Open a post and choose Add a visual, or ask the chat to suggest some images." action={<Button asChild><Link href="/posts">Go to your posts</Link></Button>} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} data-library-item={item.id} className="orbit-panel flex flex-col overflow-hidden">
              <div className="aspect-[4/5] bg-ground">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.altText ?? "An image made for a post"} loading="lazy" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center p-4 text-center text-[13px] text-text-2">
                    {item.status === "FAILED" ? "Couldn't be made" : "Making this image…"}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  {item.documentId ? (
                    <Link href={`/posts/${item.documentId}`} className="block truncate text-[13px] text-text hover:underline">{item.documentTitle ?? "Untitled post"}</Link>
                  ) : (
                    <span className="block truncate text-[13px] text-text-2">Not on a post</span>
                  )}
                  {item.status !== "COMPLETED" && <StatusPill tone={item.status === "FAILED" ? "danger" : "neutral"}>{item.status === "FAILED" ? "Failed" : "Working"}</StatusPill>}
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Delete image" onClick={() => void remove(item)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {last?.nextCursor && (
        <Button type="button" variant="secondary" className="self-center" onClick={() => void setSize(size + 1)}>Load more</Button>
      )}
    </div>
  );
}
