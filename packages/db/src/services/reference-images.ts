import { prisma } from "../client";
import type { ReferenceImage } from "../generated/prisma/client";

export const REFERENCE_TITLE_MAX = 80;
export const REFERENCE_TAGS_MAX = 8;
export const REFERENCE_TAG_MAX = 24;

export class ReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceError";
  }
}

/** Trims, lower-cases and de-duplicates tags; throws a user-readable ReferenceError on bad input. */
export function normaliseTags(tags: string[]): string[] {
  const out = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (out.length === 0) throw new ReferenceError("Add at least one tag");
  if (out.length > REFERENCE_TAGS_MAX) throw new ReferenceError(`Use at most ${REFERENCE_TAGS_MAX} tags`);
  if (out.some((t) => t.length > REFERENCE_TAG_MAX)) throw new ReferenceError(`Tags can be at most ${REFERENCE_TAG_MAX} characters`);
  return out;
}

export type CreateReferenceInput = { title: string; tags: string[]; storageObjectId: string; width: number; height: number };

/** The object must be one of this profile's live PRIVATE reference files: a reference never points at the public store. */
export async function createReference(profileId: string, input: CreateReferenceInput): Promise<ReferenceImage> {
  const title = input.title.trim();
  if (!title) throw new ReferenceError("Add a title");
  if (title.length > REFERENCE_TITLE_MAX) throw new ReferenceError(`Titles can be at most ${REFERENCE_TITLE_MAX} characters`);
  const tags = normaliseTags(input.tags);
  const file = await prisma.storageObject.findFirst({
    where: { id: input.storageObjectId, profileId, kind: "REFERENCE", store: "PRIVATE", deletedAt: null },
    select: { id: true },
  });
  if (!file) throw new ReferenceError("That file isn't available");
  return prisma.referenceImage.create({ data: { profileId, title, tags, storageObjectId: file.id, width: input.width, height: input.height } });
}

export function listReferences(profileId: string, opts: { tag?: string; q?: string }): Promise<ReferenceImage[]> {
  return prisma.referenceImage.findMany({
    where: {
      profileId,
      ...(opts.tag ? { tags: { has: opts.tag.trim().toLowerCase() } } : {}),
      ...(opts.q?.trim() ? { title: { contains: opts.q.trim(), mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
}

export function getReference(profileId: string, id: string): Promise<ReferenceImage | null> {
  return prisma.referenceImage.findFirst({ where: { id, profileId } });
}

/** Removes the reference and soft-deletes its file. False when it isn't this profile's. */
export async function deleteReference(profileId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.referenceImage.findFirst({ where: { id, profileId } });
    if (!ref) return false;
    await tx.referenceImage.delete({ where: { id } });
    await tx.storageObject.updateMany({ where: { id: ref.storageObjectId, profileId, deletedAt: null }, data: { deletedAt: new Date() } });
    return true;
  });
}

/** Distinct tags across this profile's references, sorted. */
export async function listTags(profileId: string): Promise<string[]> {
  const rows = await prisma.referenceImage.findMany({ where: { profileId }, select: { tags: true } });
  return [...new Set(rows.flatMap((r) => r.tags))].sort();
}
