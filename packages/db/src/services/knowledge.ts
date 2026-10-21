import { prisma } from "../client";
import type { KnowledgeItem, KnowledgeType } from "../generated/prisma/client";

export const KNOWLEDGE_PAGE_SIZE = 50;
export const KNOWLEDGE_TITLE_MAX = 100;
export const KNOWLEDGE_TEXT_MAX = 50_000;
export const KNOWLEDGE_MIN_WORDS = 100;
/** Cap for text extracted from files and pages (text items are held to KNOWLEDGE_TEXT_MAX). */
export const KNOWLEDGE_EXTRACTED_MAX = 200_000;

export class KnowledgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeError";
  }
}

export class KnowledgeNotFoundError extends KnowledgeError {
  constructor() {
    super("Item not found");
    this.name = "KnowledgeNotFoundError";
  }
}

export type CreateKnowledgeInput = {
  type: KnowledgeType;
  title?: string;
  content?: string;
  sourceUrl?: string;
  fileKey?: string;
  mimeType?: string;
  sizeBytes?: number;
};

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function checkTitle(raw: string | undefined): string {
  const title = (raw ?? "").trim();
  if (!title) throw new KnowledgeError("Add a title");
  if (title.length > KNOWLEDGE_TITLE_MAX) {
    throw new KnowledgeError(`Keep the title under ${KNOWLEDGE_TITLE_MAX} characters`);
  }
  return title;
}

function checkText(content: string): string {
  if (content.length > KNOWLEDGE_TEXT_MAX) {
    throw new KnowledgeError("That's too long. Keep it under 50,000 characters.");
  }
  if (wordCount(content) < KNOWLEDGE_MIN_WORDS) {
    throw new KnowledgeError(`Add at least ${KNOWLEDGE_MIN_WORDS} words`);
  }
  return content;
}

function parseHttpUrl(raw: string | undefined): URL {
  let url: URL;
  try {
    url = new URL((raw ?? "").trim());
  } catch {
    throw new KnowledgeError("Enter a link that starts with http:// or https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new KnowledgeError("Enter a link that starts with http:// or https://");
  }
  return url;
}

/** TEXT items are READY immediately; everything else starts PROCESSING and waits for an ingest job. */
export async function createKnowledge(profileId: string, input: CreateKnowledgeInput): Promise<KnowledgeItem> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { teamId: true } });
  if (!profile) throw new KnowledgeError("Profile not found");
  const base = { profileId, teamId: profile.teamId, type: input.type };

  if (input.type === "TEXT") {
    const title = checkTitle(input.title);
    const content = checkText(input.content ?? "");
    return prisma.knowledgeItem.create({ data: { ...base, title, content, status: "READY" } });
  }

  if (input.type === "URL" || input.type === "VIDEO") {
    if (input.type === "URL" || input.sourceUrl) {
      const url = parseHttpUrl(input.sourceUrl);
      const title = checkTitle(input.title?.trim() || url.hostname);
      return prisma.knowledgeItem.create({ data: { ...base, title, sourceUrl: url.toString() } });
    }
  }

  if (!input.fileKey) throw new KnowledgeError("Add a file or a link");
  const title = checkTitle(input.title);
  return prisma.knowledgeItem.create({
    data: { ...base, title, fileKey: input.fileKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
  });
}

export function getKnowledgeItem(id: string): Promise<KnowledgeItem | null> {
  return prisma.knowledgeItem.findUnique({ where: { id } });
}

export function getProfileKnowledge(profileId: string, id: string): Promise<KnowledgeItem | null> {
  return prisma.knowledgeItem.findFirst({ where: { id, profileId } });
}

export async function listKnowledge(
  profileId: string,
  opts: { type?: KnowledgeType; q?: string; order: "asc" | "desc"; offset: number },
): Promise<{ items: KnowledgeItem[]; hasMore: boolean }> {
  const q = opts.q?.trim();
  const rows = await prisma.knowledgeItem.findMany({
    where: {
      profileId,
      ...(opts.type ? { type: opts.type } : {}),
      ...(q && q.length >= 3 ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ createdAt: opts.order }, { id: opts.order }],
    skip: Math.max(0, opts.offset),
    take: KNOWLEDGE_PAGE_SIZE + 1,
  });
  return { items: rows.slice(0, KNOWLEDGE_PAGE_SIZE), hasMore: rows.length > KNOWLEDGE_PAGE_SIZE };
}

/** Only writes when the item's content still equals what the job started from. */
const startedFrom = (expected?: { content: string | null }) => (expected ? { content: expected.content } : {});

/**
 * Marks the item READY. `summary: undefined` leaves the existing summary alone. With `expected`,
 * the write is compare-and-set on content; returns null when skipped (a newer job will run).
 */
export async function completeIngest(
  id: string,
  text: string,
  summary: string | null | undefined,
  expected?: { content: string | null },
): Promise<KnowledgeItem | null> {
  const { count } = await prisma.knowledgeItem.updateMany({
    where: { id, ...startedFrom(expected) },
    data: { status: "READY", content: text, error: null, ...(summary === undefined ? {} : { summary }) },
  });
  return count === 0 ? null : getKnowledgeItem(id);
}

/**
 * Marks the item FAILED and drops its search chunks, atomically. With `expected`, it locks the row and
 * skips (null) when the content has moved on, so a concurrent successful job is never left READY without chunks.
 */
export async function failIngest(
  id: string,
  message: string,
  expected?: { content: string | null },
): Promise<KnowledgeItem | null> {
  const done = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ content: string | null; profileId: string }[]>`
      SELECT content, "profileId" FROM "KnowledgeItem" WHERE id = ${id} FOR UPDATE`;
    const row = rows[0];
    if (!row || (expected && row.content !== expected.content)) return false;
    await tx.knowledgeItem.update({ where: { id }, data: { status: "FAILED", error: message } });
    await tx.$executeRaw`DELETE FROM "KnowledgeChunk" WHERE "profileId" = ${row.profileId} AND "sourceType" = 'KNOWLEDGE'::"ChunkSource" AND "sourceId" = ${id}`;
    return true;
  });
  return done ? getKnowledgeItem(id) : null;
}

/** `contentChanged` tells the caller to start a KNOWLEDGE_INGEST job that re-indexes the item. */
export async function updateKnowledge(
  profileId: string,
  id: string,
  patch: { title?: string; content?: string },
): Promise<{ item: KnowledgeItem; contentChanged: boolean }> {
  const existing = await getProfileKnowledge(profileId, id);
  if (!existing) throw new KnowledgeNotFoundError();
  const data: { title?: string; content?: string } = {};
  if (patch.title !== undefined) data.title = checkTitle(patch.title);
  let contentChanged = false;
  if (patch.content !== undefined && patch.content !== existing.content) {
    if (existing.status === "PROCESSING") throw new KnowledgeError("Wait for processing to finish before editing");
    if (existing.type === "TEXT") checkText(patch.content);
    else if (!patch.content.trim()) throw new KnowledgeError("Content can't be empty");
    else if (patch.content.length > KNOWLEDGE_EXTRACTED_MAX) throw new KnowledgeError("That's too long.");
    data.content = patch.content;
    contentChanged = true;
  }
  const item = await prisma.knowledgeItem.update({
    where: { id },
    data: { ...data, ...(contentChanged ? { status: "READY" as const, error: null } : {}) },
  });
  return { item, contentChanged };
}

/** Deletes the item, its search chunks (same transaction) and, via `store`, its uploaded file. */
export async function deleteKnowledge(
  profileId: string,
  id: string,
  store?: { delete(key: string): Promise<void> },
): Promise<void> {
  const existing = await getProfileKnowledge(profileId, id);
  if (!existing) throw new KnowledgeNotFoundError();
  await prisma.$transaction(async (tx) => {
    // Lock the row first so an in-flight chunk swap either finishes before us or sees the item gone.
    await tx.$queryRaw`SELECT id FROM "KnowledgeItem" WHERE id = ${id} FOR UPDATE`;
    await tx.$executeRaw`DELETE FROM "KnowledgeChunk" WHERE "profileId" = ${profileId} AND "sourceType" = 'KNOWLEDGE'::"ChunkSource" AND "sourceId" = ${id}`;
    await tx.knowledgeItem.deleteMany({ where: { id, profileId } });
  });
  if (existing.fileKey && store) {
    try {
      await store.delete(existing.fileKey);
    } catch (err) {
      console.warn("deleteKnowledge: could not remove stored file:", err instanceof Error ? err.message : String(err));
    }
  }
}
