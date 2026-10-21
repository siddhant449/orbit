import { prisma } from "../client";
import type { KnowledgeItem, KnowledgeType } from "../generated/prisma/client";
import { deleteChunks } from "./retrieval";

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

export function completeIngest(id: string, text: string, summary: string | null): Promise<KnowledgeItem> {
  return prisma.knowledgeItem.update({
    where: { id },
    data: { status: "READY", content: text, summary, error: null },
  });
}

export function failIngest(id: string, message: string): Promise<KnowledgeItem> {
  return prisma.knowledgeItem.update({ where: { id }, data: { status: "FAILED", error: message } });
}

/** `contentChanged` tells the caller to start a KNOWLEDGE_INGEST job that re-indexes the item. */
export async function updateKnowledge(
  profileId: string,
  id: string,
  patch: { title?: string; content?: string },
): Promise<{ item: KnowledgeItem; contentChanged: boolean }> {
  const existing = await getProfileKnowledge(profileId, id);
  if (!existing) throw new KnowledgeError("Item not found");
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

/** Deletes the item, its search chunks and (via `store`) its uploaded file. */
export async function deleteKnowledge(
  profileId: string,
  id: string,
  store?: { delete(key: string): Promise<void> },
): Promise<void> {
  const existing = await getProfileKnowledge(profileId, id);
  if (!existing) throw new KnowledgeError("Item not found");
  await prisma.knowledgeItem.delete({ where: { id } });
  await deleteChunks(profileId, "KNOWLEDGE", id);
  if (existing.fileKey && store) {
    try {
      await store.delete(existing.fileKey);
    } catch (err) {
      console.warn("deleteKnowledge: could not remove stored file:", err instanceof Error ? err.message : String(err));
    }
  }
}
