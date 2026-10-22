import { prisma } from "../client";
import type { PostMedia } from "../generated/prisma/client";

/** LinkedIn allows up to 20 images in one post. */
export const POST_MEDIA_MAX = 20;

export class PostMediaError extends Error {
  constructor(
    readonly code: "not_found" | "not_ready" | "limit",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PostMediaError";
  }
}

/**
 * Attaches the visual's CURRENT version to the post (a draft follows later edits, see visuals.ts). Idempotent per
 * (post, visual). Both must be this profile's; the visual must be completed and idle.
 */
export async function attachVisual(profileId: string, visualId: string, documentId: string): Promise<PostMedia> {
  return prisma.$transaction(async (tx) => {
    const visual = await tx.visual.findFirst({ where: { id: visualId, profileId, deletedAt: null } });
    const doc = await tx.document.findFirst({ where: { id: documentId, profileId, deletedAt: null }, select: { id: true } });
    if (!visual || !doc) throw new PostMediaError("not_found");
    if (visual.status !== "COMPLETED" || visual.activeOp) throw new PostMediaError("not_ready", "This image isn't ready yet");
    const current = await tx.visualVersion.findUnique({ where: { visualId_version: { visualId, version: visual.currentVersion } } });
    if (!current) throw new PostMediaError("not_ready", "This image isn't ready yet");

    // Serialise attaches to one post so the count and the position can't race.
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
    const existing = await tx.postMedia.findUnique({ where: { documentId_visualId: { documentId, visualId } } });
    if (existing) return existing;
    const { _count, _max } = await tx.postMedia.aggregate({ where: { documentId }, _count: true, _max: { position: true } });
    if (_count >= POST_MEDIA_MAX) throw new PostMediaError("limit", `A post can have up to ${POST_MEDIA_MAX} images`);
    return tx.postMedia.create({
      data: { documentId, kind: "IMAGE", position: (_max.position ?? -1) + 1, visualId, storageObjectId: current.storageObjectId, altText: visual.altText },
    });
  });
}

/** Removes the visual from the post. Media frozen by publishing stays. False when nothing was removed. */
export async function detachVisual(profileId: string, visualId: string, documentId: string): Promise<boolean> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, profileId }, select: { id: true } });
  if (!doc) return false;
  const { count } = await prisma.postMedia.deleteMany({ where: { documentId, visualId, frozenAt: null } });
  return count > 0;
}

export async function listMedia(profileId: string, documentId: string): Promise<PostMedia[]> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, profileId }, select: { id: true } });
  if (!doc) return [];
  return prisma.postMedia.findMany({ where: { documentId }, orderBy: { position: "asc" } });
}

/** Called by the publisher once a post is published: its media no longer follows the visual's edits. Returns rows frozen. */
export async function freezeMedia(documentId: string): Promise<number> {
  const { count } = await prisma.postMedia.updateMany({ where: { documentId, frozenAt: null }, data: { frozenAt: new Date() } });
  return count;
}
