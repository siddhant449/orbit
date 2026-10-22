import { prisma } from "../client";
import { Prisma } from "../generated/prisma/client";
import type { Document, StorageObject, Visual, VisualAspect, VisualType, VisualVersion, VisualVersionKind } from "../generated/prisma/client";
import { lockAccount, OutOfCreditsError, toState, type Tx } from "./credits";

export type VisualOp = "generate" | "edit" | "logo";

export class VisualError extends Error {
  constructor(
    readonly code: "not_found" | "in_progress" | "edit_limit" | "invalid",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "VisualError";
  }
}

/** A PROCESSING visual whose worker went quiet this long ago can be claimed again (crash recovery). */
export const STALE_OP_MS = 10 * 60_000;
export const VISUAL_PAGE_SIZE = 24;

export type CreateVisualInput = {
  profileId: string;
  teamId: string;
  userId: string;
  requestId: string;
  documentId?: string | null;
  type: VisualType;
  aspect: VisualAspect;
  userPrompt: string;
  customInstructions?: string | null;
  useBrandColours: boolean;
  referenceId?: string | null;
};

/**
 * One transaction: lock the team's credit account, refill if due, check, decrement, create the visual (PENDING,
 * `activeOp: "generate"`) and write the GENERATE ledger row. The same `(teamId, requestId)` returns the existing visual
 * with no debit, even at a zero balance. Throws OutOfCreditsError, or VisualError("in_progress") when this post already
 * has a generation running.
 */
export async function createVisualWithDebit(
  input: CreateVisualInput,
  now: Date = new Date(),
): Promise<{ visual: Visual; balance: number; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const account = await lockAccount(tx, input.teamId, now);

    const existing = await tx.visual.findUnique({ where: { teamId_requestId: { teamId: input.teamId, requestId: input.requestId } } });
    if (existing) {
      if (existing.profileId !== input.profileId) throw new VisualError("not_found");
      return { visual: existing, balance: account.balance, created: false };
    }

    if (input.documentId) {
      const doc = await tx.document.findFirst({ where: { id: input.documentId, profileId: input.profileId, deletedAt: null }, select: { id: true } });
      if (!doc) throw new VisualError("not_found", "Post not found");
      const running = await tx.visual.findFirst({
        where: { documentId: input.documentId, deletedAt: null, activeOp: "generate", status: { in: ["PENDING", "PROCESSING"] } },
        select: { id: true },
      });
      if (running) throw new VisualError("in_progress", "An image is already being made for this post");
    }

    if (account.balance < 1) throw new OutOfCreditsError(account.balance, toState(account).refillsAt);

    const balance = account.balance - 1;
    await tx.creditAccount.update({ where: { teamId: input.teamId }, data: { balance } });
    const visual = await tx.visual.create({
      data: {
        profileId: input.profileId,
        teamId: input.teamId,
        documentId: input.documentId ?? null,
        createdByUserId: input.userId,
        requestId: input.requestId,
        type: input.type,
        aspect: input.aspect,
        userPrompt: input.userPrompt,
        customInstructions: input.customInstructions ?? null,
        useBrandColours: input.useBrandColours,
        referenceId: input.referenceId ?? null,
        activeOp: "generate",
        activeOpStartedAt: now,
      },
    });
    await tx.creditLedger.create({
      data: { teamId: input.teamId, profileId: input.profileId, delta: -1, balanceAfter: balance, reason: "GENERATE", visualId: visual.id, createdAt: now },
    });
    return { visual, balance, created: true };
  });
}

/**
 * Compare-and-set into PROCESSING for the job that is about to do the work: from PENDING (generate) or COMPLETED
 * (edit/logo) with a matching `activeOp`. Returns null when another worker already has it, the op doesn't match, or it
 * already finished (a duplicate delivery).
 */
export async function startOp(visualId: string, op: VisualOp, now: Date = new Date()): Promise<Visual | null> {
  const stale = new Date(now.getTime() - STALE_OP_MS);
  const { count } = await prisma.visual.updateMany({
    where: {
      id: visualId,
      deletedAt: null,
      activeOp: op,
      OR: [{ status: op === "generate" ? "PENDING" : "COMPLETED" }, { status: "PROCESSING", activeOpStartedAt: { lt: stale } }],
    },
    data: { status: "PROCESSING", activeOpStartedAt: now },
  });
  return count === 1 ? prisma.visual.findUnique({ where: { id: visualId } }) : null;
}

export type GenerateResult = { storageObjectId: string; width: number; height: number; provider: string; builtPrompt: string };

/** Writes version 0 and marks the visual COMPLETED. Null (and nothing written) unless it is PROCESSING a generate. */
export async function completeGenerate(visualId: string, r: GenerateResult): Promise<Visual | null> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.visual.updateMany({
      where: { id: visualId, status: "PROCESSING", activeOp: "generate" },
      data: { status: "COMPLETED", currentVersion: 0, activeOp: null, activeOpStartedAt: null, opInput: Prisma.JsonNull, error: null, provider: r.provider, builtPrompt: r.builtPrompt },
    });
    if (count === 0) return null;
    await tx.visualVersion.create({
      data: { visualId, version: 0, kind: "GENERATED", storageObjectId: r.storageObjectId, width: r.width, height: r.height },
    });
    return tx.visual.findUnique({ where: { id: visualId } });
  });
}

/**
 * Marks a PENDING/PROCESSING visual FAILED and, with `refund`, returns its credit in the same transaction (ledger
 * REFUND, unique per visual). Returns false (a no-op) when the visual is not in flight: a second call changes nothing.
 */
export async function failVisual(visualId: string, error: string, opts: { refund: boolean }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const visual = await tx.visual.findUnique({ where: { id: visualId } });
    if (!visual) return false;
    const { count } = await tx.visual.updateMany({
      where: { id: visualId, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "FAILED", error, activeOp: null, activeOpStartedAt: null, opInput: Prisma.JsonNull },
    });
    if (count === 0) return false;
    if (opts.refund) await refundTx(tx, visual);
    return true;
  });
}

async function refundTx(tx: Tx, visual: Visual): Promise<void> {
  const debit = await tx.creditLedger.findUnique({ where: { visualId_reason: { visualId: visual.id, reason: "GENERATE" } } });
  if (!debit) return; // never charged
  const account = await lockAccount(tx, visual.teamId, new Date());
  // A refund never lifts the balance above the allocation: if the period reset in between, the credit is already back.
  const balance = account.balance < account.monthlyAllocation ? account.balance + 1 : account.balance;
  await tx.creditAccount.update({ where: { teamId: visual.teamId }, data: { balance } });
  await tx.creditLedger.create({
    data: { teamId: visual.teamId, profileId: visual.profileId, delta: balance - account.balance, balanceAfter: balance, reason: "REFUND", visualId: visual.id },
  });
}

/**
 * Claims the visual's single operation slot for an edit or a logo: the visual must be COMPLETED, idle, in the editor's
 * profile and under the edit cap. Throws not_found, invalid (not completed), in_progress or edit_limit.
 */
export async function beginEdit(
  profileId: string,
  visualId: string,
  op: "edit" | "logo" = "edit",
  input?: Prisma.InputJsonValue,
  now: Date = new Date(),
): Promise<Visual> {
  const claimed = await prisma.visual.updateMany({
    where: { id: visualId, profileId, deletedAt: null, status: "COMPLETED", activeOp: null, editCount: { lt: 5 } },
    data: { activeOp: op, activeOpStartedAt: now, opInput: input ?? Prisma.JsonNull, error: null },
  });
  if (claimed.count === 1) {
    // maxEdits is per row; re-check in case it was lowered below the count (cheap guard against the fixed 5 above).
    const v = (await prisma.visual.findUnique({ where: { id: visualId } }))!;
    if (v.editCount >= v.maxEdits) {
      await prisma.visual.update({ where: { id: visualId }, data: { activeOp: null, activeOpStartedAt: null, opInput: Prisma.JsonNull } });
      throw new VisualError("edit_limit", "This image has used all of its edits");
    }
    return v;
  }
  const v = await prisma.visual.findFirst({ where: { id: visualId, profileId, deletedAt: null } });
  if (!v) throw new VisualError("not_found");
  if (v.status === "FAILED") throw new VisualError("invalid", "This image couldn't be made, so it can't be edited");
  if (v.activeOp || v.status !== "COMPLETED") throw new VisualError("in_progress", "This image is busy");
  if (v.editCount >= v.maxEdits) throw new VisualError("edit_limit", "This image has used all of its edits");
  throw new VisualError("in_progress", "This image is busy");
}

export type EditResult = {
  storageObjectId: string;
  editPrompt: string | null;
  kind: Extract<VisualVersionKind, "EDIT" | "LOGO">;
  width: number;
  height: number;
};

/** Adds version `max + 1`, moves `currentVersion` to it and counts the edit. Returns the new version, or null if no op was running. */
export async function completeEdit(visualId: string, r: EditResult): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const visual = await tx.visual.findUnique({ where: { id: visualId } });
    if (!visual) return null;
    const next = (await tx.visualVersion.aggregate({ where: { visualId }, _max: { version: true } }))._max.version! + 1;
    const { count } = await tx.visual.updateMany({
      where: { id: visualId, status: "PROCESSING", activeOp: { in: ["edit", "logo"] } },
      data: { status: "COMPLETED", currentVersion: next, editCount: { increment: 1 }, activeOp: null, activeOpStartedAt: null, opInput: Prisma.JsonNull, error: null },
    });
    if (count === 0) return null;
    await tx.visualVersion.create({
      data: { visualId, version: next, kind: r.kind, storageObjectId: r.storageObjectId, editPrompt: r.editPrompt, width: r.width, height: r.height },
    });
    return next;
  });
}

/**
 * A transient failure: hand the operation back (PROCESSING -> PENDING for a generate, -> COMPLETED for an edit/logo,
 * `activeOp` kept) so the retried job can `startOp` it again. False when it wasn't being processed.
 */
export async function requeueOp(visualId: string): Promise<boolean> {
  const v = await prisma.visual.findUnique({ where: { id: visualId }, select: { activeOp: true, status: true } });
  if (!v || v.status !== "PROCESSING" || !v.activeOp) return false;
  const { count } = await prisma.visual.updateMany({
    where: { id: visualId, status: "PROCESSING", activeOp: v.activeOp },
    data: { status: v.activeOp === "generate" ? "PENDING" : "COMPLETED" },
  });
  return count === 1;
}

/** An edit/logo failed: clear the op, keep the current version and the edit count, record the user-safe error. */
export async function failEdit(visualId: string, error: string): Promise<boolean> {
  const { count } = await prisma.visual.updateMany({
    where: { id: visualId, activeOp: { in: ["edit", "logo"] }, status: { in: ["COMPLETED", "PROCESSING"] } },
    data: { status: "COMPLETED", activeOp: null, activeOpStartedAt: null, opInput: Prisma.JsonNull, error },
  });
  return count === 1;
}

/** Makes an earlier version current again by adding a REVERT version that points at the same file. Free and uncapped. */
export async function revertVisual(profileId: string, visualId: string, version: number): Promise<{ version: number }> {
  return prisma.$transaction(async (tx) => {
    const visual = await tx.visual.findFirst({ where: { id: visualId, profileId, deletedAt: null } });
    if (!visual) throw new VisualError("not_found");
    if (visual.status === "FAILED") throw new VisualError("invalid");
    if (visual.status !== "COMPLETED" || visual.activeOp) throw new VisualError("in_progress");
    if (version === visual.currentVersion) throw new VisualError("invalid", "That version is already current");
    const target = await tx.visualVersion.findUnique({ where: { visualId_version: { visualId, version } } });
    if (!target) throw new VisualError("invalid", "That version doesn't exist");
    const next = (await tx.visualVersion.aggregate({ where: { visualId }, _max: { version: true } }))._max.version! + 1;
    // Compare-and-set on the version we read: a concurrent edit or revert makes this match nothing.
    const { count } = await tx.visual.updateMany({
      where: { id: visualId, currentVersion: visual.currentVersion, activeOp: null, status: "COMPLETED" },
      data: { currentVersion: next },
    });
    if (count === 0) throw new VisualError("in_progress");
    await tx.visualVersion.create({
      data: { visualId, version: next, kind: "REVERT", storageObjectId: target.storageObjectId, width: target.width, height: target.height },
    });
    return { version: next };
  });
}

export type VersionWithObject = VisualVersion & { storageObject: StorageObject };
export type VisualWithCurrent = { visual: Visual; current: VersionWithObject | null };

export async function getVisual(profileId: string, id: string): Promise<VisualWithCurrent | null> {
  const visual = await prisma.visual.findFirst({ where: { id, profileId, deletedAt: null } });
  if (!visual) return null;
  const current = await prisma.visualVersion.findUnique({
    where: { visualId_version: { visualId: id, version: visual.currentVersion } },
    include: { storageObject: true },
  });
  return { visual, current };
}

/** The visual of this post with an operation in flight, if any (resume polling on editor mount). */
export function getActiveForDocument(profileId: string, documentId: string): Promise<Visual | null> {
  return prisma.visual.findFirst({
    where: { profileId, documentId, deletedAt: null, activeOp: { not: null } },
    orderBy: { createdAt: "desc" },
  });
}

export type LibraryItem = Visual & { document: Pick<Document, "id" | "title"> | null; versions: VersionWithObject[] };

/** Library page, newest first. `versions` holds the current version only. */
export async function listVisuals(
  profileId: string,
  opts: { cursor?: string; documentId?: string; limit?: number },
): Promise<{ items: LibraryItem[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? VISUAL_PAGE_SIZE, 100);
  const rows = await prisma.visual.findMany({
    where: { profileId, deletedAt: null, ...(opts.documentId ? { documentId: opts.documentId } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { document: { select: { id: true, title: true } } },
  });
  const page = rows.slice(0, limit);
  const versions = await prisma.visualVersion.findMany({
    where: { OR: page.map((v) => ({ visualId: v.id, version: v.currentVersion })) },
    include: { storageObject: true },
  });
  const items = page.map((v) => ({ ...v, versions: versions.filter((x) => x.visualId === v.id && x.version === v.currentVersion) }));
  return { items, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
}

export async function listVersions(profileId: string, id: string): Promise<VersionWithObject[]> {
  const visual = await prisma.visual.findFirst({ where: { id, profileId, deletedAt: null }, select: { id: true } });
  if (!visual) return [];
  return prisma.visualVersion.findMany({ where: { visualId: id }, orderBy: { version: "asc" }, include: { storageObject: true } });
}

export const ALT_TEXT_MAX = 1_000;

/** Sets (or clears, with null/blank) the alt text. Returns false when the visual isn't this profile's. */
export async function updateAltText(profileId: string, id: string, altText: string | null): Promise<boolean> {
  const text = altText?.trim() || null;
  if (text && text.length > ALT_TEXT_MAX) throw new VisualError("invalid", `Alt text can be at most ${ALT_TEXT_MAX} characters`);
  const { count } = await prisma.visual.updateMany({ where: { id, profileId, deletedAt: null }, data: { altText: text } });
  return count === 1;
}

/** Soft delete. An operation in flight is left to finish into a deleted visual and then be ignored. False when not found. */
export async function deleteVisual(profileId: string, id: string): Promise<boolean> {
  const { count } = await prisma.visual.updateMany({ where: { id, profileId, deletedAt: null }, data: { deletedAt: new Date() } });
  return count === 1;
}
