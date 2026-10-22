"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import useSWR from "swr";
import { Button } from "@brandloop/ui";
import { AddVisualDialog } from "@/components/visuals/add-visual-dialog";
import { detachVisual, listPostMedia } from "@/lib/visuals-api";

export const postMediaKey = (documentId: string) => ["post-media", documentId] as const;

/** The image block of a post: what is attached (with a remove button) and an "Add a visual" button. */
export function PostImage({ documentId }: { documentId: string }) {
  const { data, mutate } = useSWR(postMediaKey(documentId), () => listPostMedia(documentId), { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const media = (data ?? []).filter((m) => m.url);

  async function remove(visualId: string | null) {
    if (!visualId) return;
    setError(null);
    try {
      await detachVisual(visualId, documentId);
      await mutate();
    } catch {
      setError("Couldn't remove the image. Try again.");
    }
  }

  return (
    <div data-post-image className="mt-4 flex flex-col gap-3">
      {media.map((m) => (
        <figure key={m.id} className="relative" data-post-media={m.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.url ?? ""} alt={m.altText ?? "Image attached to the post"} className="w-full rounded-card-sm border border-line-paper" />
          {!m.frozen && (
            <Button type="button" variant="secondary" size="sm" className="absolute right-2 top-2" onClick={() => void remove(m.visualId)} aria-label="Remove image from post">
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          )}
        </figure>
      ))}
      {error && <p role="alert" className="text-[13px] text-text-2">{error}</p>}
      {media.length === 0 && (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)} data-add-visual-button>
          <ImagePlus aria-hidden="true" />
          Add a visual
        </Button>
      )}
      {/* Mounted only while open, so every opening starts from a clean form. */}
      {open && <AddVisualDialog documentId={documentId} open onOpenChange={setOpen} onAttached={() => void mutate()} />}
    </div>
  );
}
