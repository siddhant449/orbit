import { prisma } from "../client";
import type { StorageKind, StorageObject, StorageStore } from "../generated/prisma/client";

export type RecordObjectInput = {
  profileId: string;
  teamId: string;
  key: string;
  store: StorageStore;
  kind: StorageKind;
  contentType: string;
  bytes: number;
  sha256: string;
  width?: number | null;
  height?: number | null;
  /** Public objects only. */
  url?: string | null;
};

export function recordObject(input: RecordObjectInput): Promise<StorageObject> {
  return prisma.storageObject.create({
    data: { ...input, width: input.width ?? null, height: input.height ?? null, url: input.store === "PUBLIC" ? (input.url ?? null) : null },
  });
}

/** A live (not deleted) object of this profile, or null. */
export function getObject(profileId: string, id: string): Promise<StorageObject | null> {
  return prisma.storageObject.findFirst({ where: { id, profileId, deletedAt: null } });
}

/** Marks the object deleted; null when it does not exist, is another profile's, or was already deleted. */
export async function softDeleteObject(profileId: string, id: string): Promise<StorageObject | null> {
  const { count } = await prisma.storageObject.updateMany({ where: { id, profileId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (count === 0) return null;
  return prisma.storageObject.findUnique({ where: { id } });
}

/** Objects deleted before `olderThan`, for the storage GC to remove from the blob store and then purge. */
export function listGcCandidates(olderThan: Date, limit = 500): Promise<StorageObject[]> {
  return prisma.storageObject.findMany({ where: { deletedAt: { lt: olderThan } }, orderBy: { deletedAt: "asc" }, take: limit });
}

/** Removes the row once its blob is gone. */
export async function purgeObject(id: string): Promise<void> {
  await prisma.storageObject.deleteMany({ where: { id, deletedAt: { not: null } } });
}
