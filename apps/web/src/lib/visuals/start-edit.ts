import { beginEdit, getVisual, prisma, VisualError } from "@brandloop/db";
import { checkVisualRequest } from "@brandloop/visuals";
import { enqueue } from "@/lib/jobs";
import { getVisualDeps, visualsEnabled } from "./deps";

export type StartEditResult =
  | { ok: true; remainingEdits: number }
  | { ok: false; status: 404 | 409 | 422 | 503; code: string; message: string; category?: string };

/**
 * The one way an edit starts, shared by the edit route and the chat's editVisual tool: image switch, safety check,
 * the edit cap and operation lock (`beginEdit`), then the `visual.edit` job. An edit is free; nothing here moves credits.
 */
export async function startVisualEdit(profileId: string, visualId: string, instruction: string, requestId: string): Promise<StartEditResult> {
  if (!visualsEnabled()) return { ok: false, status: 503, code: "visuals_disabled", message: "Image editing is paused right now." };
  const found = await getVisual(profileId, visualId);
  if (!found) return { ok: false, status: 404, code: "not_found", message: "Image not found." };

  const deps = getVisualDeps();
  const verdict = await checkVisualRequest(deps.ai, instruction, { log: deps.log });
  if (!verdict.allowed) return { ok: false, status: 422, code: "refused", message: verdict.message, category: verdict.category };

  try {
    await beginEdit(profileId, visualId, "edit", { instruction });
  } catch (err) {
    if (err instanceof VisualError) {
      if (err.code === "not_found") return { ok: false, status: 404, code: "not_found", message: "Image not found." };
      if (err.code === "in_progress") return { ok: false, status: 409, code: "visual_in_progress", message: "this image is busy. Try again in a moment." };
      if (err.code === "edit_limit") return { ok: false, status: 409, code: "edit_limit", message: "this image has used all of its edits." };
      return { ok: false, status: 422, code: "invalid", message: err.message === "invalid" ? "that can't be done to this image." : err.message };
    }
    throw err;
  }
  await enqueue("visual.edit", { visualId }, { dedupeId: `visual:${visualId}:edit:${requestId}` });
  return { ok: true, remainingEdits: Math.max(0, found.visual.maxEdits - found.visual.editCount - 1) };
}

/** The newest finished image for this post: one attached to it first, else the newest made for it. */
export async function latestVisualForPost(profileId: string, documentId: string): Promise<{ id: string } | null> {
  const media = await prisma.postMedia.findFirst({
    where: { documentId, document: { profileId }, visual: { profileId, deletedAt: null, status: "COMPLETED" } },
    orderBy: { position: "desc" },
    select: { visualId: true },
  });
  if (media?.visualId) return { id: media.visualId };
  const made = await prisma.visual.findFirst({
    where: { profileId, documentId, deletedAt: null, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return made;
}
