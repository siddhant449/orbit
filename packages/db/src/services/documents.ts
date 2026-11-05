import { prisma } from "../client";
import { Prisma } from "../generated/prisma/client";
import type { VersionSource } from "../generated/prisma/client";

/** Posts (design §4, §9): one per chat, versioned, every read and write scoped to the profile. */

export type DocumentErrorCode = "EXISTING_POST" | "not_found" | "invalid" | "already_applied";

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;
  constructor(code: DocumentErrorCode, message?: string) {
    super(
      message ??
        (code === "EXISTING_POST"
          ? "A post already exists in this chat."
          : code === "not_found"
            ? "Document not found."
            : code === "already_applied"
              ? "That suggestion was already applied to this post."
              : "Invalid document."),
    );
    this.name = "DocumentError";
    this.code = code;
  }
}

/** The save carried an `expectedVersion` (the document's revision, as the clients hold it) that is no longer current. */
export class DocumentVersionConflict extends Error {
  readonly currentVersion: number;
  constructor(currentVersion: number) {
    super(`The document is now at version ${currentVersion}.`);
    this.name = "DocumentVersionConflict";
    this.currentVersion = currentVersion;
  }
}

export type DocumentSnapshot = {
  id: string;
  title: string;
  kind: "TEXT";
  status: "DRAFT";
  /** The concurrency token (`Document.revision`): moves up on every save and version switch. Clients echo it as `expectedVersion`. */
  version: number;
  /** The number of the version whose text is current. Switching versions moves it; the next save writes max + 1. */
  currentVersion: number;
  text: string;
  hook: string | null;
  chatId: string | null;
  updatedAt: Date;
  /** When the writer marked the post as posted; null until then. Nothing is published by it. */
  postedAt: Date | null;
};

export type DocumentVersionRow = {
  version: number;
  source: VersionSource;
  changeSummary: string | null;
  createdAt: Date;
  chars: number;
  /** The edit proposal a PROPOSAL version applied. */
  proposalId: string | null;
};

export const DOCUMENT_TITLE_MAX = 120;
export const DOCUMENT_TEXT_MAX = 10_000;
const SUMMARY_MAX = 500;

function cleanTitle(title: string): string {
  const t = title.trim();
  if (t.length < 1 || t.length > DOCUMENT_TITLE_MAX) {
    throw new DocumentError("invalid", `A title must be 1 to ${DOCUMENT_TITLE_MAX} characters.`);
  }
  return t;
}

function checkText(text: string): string {
  if (text.trim().length < 1 || text.length > DOCUMENT_TEXT_MAX) {
    throw new DocumentError("invalid", `The text must be 1 to ${DOCUMENT_TEXT_MAX.toLocaleString("en-US")} characters.`);
  }
  return text;
}

const cleanSummary = (s: string | null | undefined) => (s?.trim() ? s.trim().slice(0, SUMMARY_MAX) : null);

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

type Tx = Prisma.TransactionClient;

async function snapshot(db: Tx | typeof prisma, profileId: string, id: string): Promise<DocumentSnapshot | null> {
  const doc = await db.document.findFirst({
    where: { id, profileId, deletedAt: null },
    include: { chat: { select: { id: true, deletedAt: true } } },
  });
  if (!doc) return null;
  const current = await db.documentVersion.findUnique({
    where: { documentId_version: { documentId: doc.id, version: doc.version } },
  });
  if (!current) return null;
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    status: doc.status,
    version: doc.revision,
    currentVersion: doc.version,
    text: current.text,
    hook: current.hook,
    chatId: doc.chat && !doc.chat.deletedAt ? doc.chat.id : null,
    updatedAt: doc.updatedAt,
    postedAt: doc.postedAt,
  };
}

/**
 * Creates the chat's post as version 1 (AI_CREATE) and links the chat to it, in one transaction.
 * A chat that already has a post (even one created concurrently) gets `EXISTING_POST` and nothing is written.
 */
export async function createDocumentForChat(
  profileId: string,
  chatId: string,
  input: { title: string; text: string; hook?: string; changeSummary?: string },
): Promise<DocumentSnapshot> {
  const title = cleanTitle(input.title);
  const text = checkText(input.text);
  return prisma.$transaction(async (tx) => {
    const chat = await tx.chat.findFirst({ where: { id: chatId, profileId, deletedAt: null }, select: { documentId: true } });
    if (!chat) throw new DocumentError("not_found", "Chat not found.");
    if (chat.documentId) throw new DocumentError("EXISTING_POST");
    const doc = await tx.document.create({
      data: {
        profileId,
        title,
        version: 1,
        versions: {
          create: { version: 1, text, hook: input.hook?.trim() || null, source: "AI_CREATE", changeSummary: cleanSummary(input.changeSummary) },
        },
      },
    });
    // The conditional link is the guard: a racing create blocks on the row, then sees documentId set and matches nothing.
    const { count } = await tx.chat.updateMany({
      where: { id: chatId, profileId, deletedAt: null, documentId: null },
      data: { documentId: doc.id },
    });
    if (count === 0) throw new DocumentError("EXISTING_POST");
    return (await snapshot(tx, profileId, doc.id))!;
  });
}

export function getDocument(profileId: string, id: string): Promise<DocumentSnapshot | null> {
  return snapshot(prisma, profileId, id);
}

/** The post linked to the profile's chat, or null. */
export async function getChatDocument(profileId: string, chatId: string): Promise<DocumentSnapshot | null> {
  const chat = await prisma.chat.findFirst({ where: { id: chatId, profileId, deletedAt: null }, select: { documentId: true } });
  return chat?.documentId ? snapshot(prisma, profileId, chat.documentId) : null;
}

/** A row on the Posts board, list and calendar: the post with its current version's text. */
export type PostSummary = {
  id: string;
  title: string;
  status: "DRAFT";
  version: number;
  currentVersion: number;
  text: string;
  /** The live chat beside the post, or null once it was deleted (the editor links a new one on first send). */
  chatId: string | null;
  createdAt: Date;
  updatedAt: Date;
  postedAt: Date | null;
};

export const POSTS_PAGE_SIZE = 200;

/**
 * The profile's posts, last edited first. Every post opens in its editor at `/posts/<id>`, so a post whose chat was
 * deleted stays listed (with a null `chatId`).
 */
export async function listPosts(
  profileId: string,
  /** `textMax` keeps only the first N characters of each post's text (the Posts screen only renders an excerpt). */
  opts: { limit?: number; textMax?: number } = {},
): Promise<{ posts: PostSummary[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? POSTS_PAGE_SIZE, 1), 500);
  const textMax = Math.max(Math.floor(opts.textMax ?? 1_000_000), 0);
  // One joined read of the rows and the current version's text, instead of a second query keyed by the rows.
  const [rows, total] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string;
        title: string;
        status: "DRAFT";
        version: number;
        revision: number;
        createdAt: Date;
        updatedAt: Date;
        postedAt: Date | null;
        chatId: string | null;
        chatDeletedAt: Date | null;
        text: string | null;
      }[]
    >(Prisma.sql`
      SELECT d."id", d."title", d."status"::text AS "status", d."version", d."revision", d."createdAt", d."updatedAt", d."postedAt",
             c."id" AS "chatId", c."deletedAt" AS "chatDeletedAt", left(v."text", ${textMax}) AS "text"
      FROM "Document" d
      LEFT JOIN "Chat" c ON c."documentId" = d."id"
      LEFT JOIN "DocumentVersion" v ON v."documentId" = d."id" AND v."version" = d."version"
      WHERE d."profileId" = ${profileId} AND d."deletedAt" IS NULL
      ORDER BY d."updatedAt" DESC, d."id" DESC
      LIMIT ${limit}
    `),
    prisma.document.count({ where: { profileId, deletedAt: null } }),
  ]);
  const posts = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    version: r.revision,
    currentVersion: r.version,
    text: r.text ?? "",
    chatId: r.chatId && !r.chatDeletedAt ? r.chatId : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    postedAt: r.postedAt,
  }));
  return { posts, total };
}

type SaveInput = {
  text: string;
  title?: string;
  /** Omitted keeps the current hook; null clears it (a version switch doesn't use this). */
  hook?: string | null;
  source: VersionSource;
  changeSummary?: string;
  expectedVersion: number;
  /** A PROPOSAL version's proposal (tool call) id: each proposal applies once per document. */
  proposalId?: string;
};

function proposalApplied(db: Tx | typeof prisma, documentId: string, proposalId: string): Promise<boolean> {
  return db.documentVersion.count({ where: { documentId, proposalId } }).then((n) => n > 0);
}

/**
 * Writes version max(version) + 1 and makes it current. The compare-and-set on `Document.revision` (and the unique
 * `(documentId, version)`) reject a stale writer with `DocumentVersionConflict`; the newer text stays.
 */
export async function saveDocumentVersion(profileId: string, id: string, input: SaveInput): Promise<DocumentSnapshot> {
  const text = checkText(input.text);
  const title = input.title === undefined ? undefined : cleanTitle(input.title);
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.proposalId && (await proposalApplied(tx, id, input.proposalId))) throw new DocumentError("already_applied");
      const before = await tx.document.findFirst({ where: { id, profileId, deletedAt: null }, select: { version: true } });
      const { count } = await tx.document.updateMany({
        where: { id, profileId, deletedAt: null, revision: input.expectedVersion },
        data: { revision: input.expectedVersion + 1, ...(title ? { title } : {}) },
      });
      if (count === 0 || !before) {
        const doc = await tx.document.findFirst({ where: { id, profileId, deletedAt: null }, select: { revision: true } });
        if (!doc) throw new DocumentError("not_found");
        // A concurrent apply of the same proposal won: report that, not a generic conflict.
        if (input.proposalId && (await proposalApplied(tx, id, input.proposalId))) throw new DocumentError("already_applied");
        throw new DocumentVersionConflict(doc.revision);
      }
      const max = await tx.documentVersion.aggregate({ where: { documentId: id }, _max: { version: true } });
      const next = (max._max.version ?? before.version) + 1;
      let hook: string | null;
      if (input.hook === undefined) {
        const prev = await tx.documentVersion.findUnique({
          where: { documentId_version: { documentId: id, version: before.version } },
          select: { hook: true },
        });
        hook = prev?.hook ?? null;
      } else {
        hook = input.hook?.trim() || null;
      }
      await tx.documentVersion.create({
        data: {
          documentId: id,
          version: next,
          text,
          hook,
          source: input.source,
          changeSummary: cleanSummary(input.changeSummary),
          proposalId: input.proposalId ?? null,
        },
      });
      await tx.document.update({ where: { id }, data: { version: next } });
      return (await snapshot(tx, profileId, id))!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      if (input.proposalId && (await proposalApplied(prisma, id, input.proposalId))) throw new DocumentError("already_applied");
      const doc = await prisma.document.findFirst({ where: { id, profileId }, select: { revision: true } });
      throw new DocumentVersionConflict(doc?.revision ?? input.expectedVersion + 1);
    }
    throw err;
  }
}

/** Newest first. */
export async function listDocumentVersions(profileId: string, id: string): Promise<DocumentVersionRow[]> {
  const doc = await prisma.document.findFirst({ where: { id, profileId, deletedAt: null }, select: { id: true } });
  if (!doc) throw new DocumentError("not_found");
  const rows = await prisma.documentVersion.findMany({
    where: { documentId: doc.id },
    orderBy: { version: "desc" },
    select: { version: true, source: true, changeSummary: true, createdAt: true, text: true, proposalId: true },
  });
  return rows.map(({ text, ...r }) => ({ ...r, chars: text.length }));
}

/** Makes any saved version current (free switching, either direction). No row is written: history is untouched, the next save is max + 1. */
export async function switchDocumentVersion(
  profileId: string,
  id: string,
  version: number,
  expectedVersion: number,
): Promise<DocumentSnapshot> {
  return prisma.$transaction(async (tx) => {
    const old = await tx.documentVersion.findFirst({
      where: { version, document: { id, profileId, deletedAt: null } },
      select: { version: true },
    });
    if (!old) throw new DocumentError("not_found", "That version doesn't exist.");
    const { count } = await tx.document.updateMany({
      where: { id, profileId, deletedAt: null, revision: expectedVersion },
      data: { version, revision: expectedVersion + 1 },
    });
    if (count === 0) {
      const doc = await tx.document.findFirst({ where: { id, profileId, deletedAt: null }, select: { revision: true } });
      if (!doc) throw new DocumentError("not_found");
      throw new DocumentVersionConflict(doc.revision);
    }
    return (await snapshot(tx, profileId, id))!;
  });
}

export type DocumentListRow = Omit<DocumentSnapshot, "hook" | "kind" | "postedAt">;

/** The profile's posts, most recently changed first, each with its current text. */
export async function listDocuments(profileId: string, opts: { limit?: number } = {}): Promise<DocumentListRow[]> {
  const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const docs = await prisma.document.findMany({
    where: { profileId, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    include: { chat: { select: { id: true, deletedAt: true } } },
  });
  if (!docs.length) return [];
  const current = await prisma.documentVersion.findMany({
    where: { OR: docs.map((d) => ({ documentId: d.id, version: d.version })) },
    select: { documentId: true, text: true },
  });
  const textOf = new Map(current.map((v) => [v.documentId, v.text]));
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    version: d.revision,
    currentVersion: d.version,
    text: textOf.get(d.id) ?? "",
    chatId: d.chat && !d.chat.deletedAt ? d.chat.id : null,
    updatedAt: d.updatedAt,
  }));
}

/**
 * The chat beside a post in the editor. A post keeps its live chat; a post whose chat was deleted gets the
 * client-chosen `chatId` as a new chat, titled after the post and linked to it (the deleted chat lets go of the
 * one-to-one link). Idempotent for the same id. A chat that already has another post is `EXISTING_POST`.
 */
export async function linkChatToDocument(
  profileId: string,
  userId: string,
  chatId: string,
  documentId: string,
): Promise<{ chatId: string; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    // Locks the post's row, so two first sends serialise and the second sees the first one's chat.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Document" WHERE id = ${documentId} AND "profileId" = ${profileId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!locked.length) throw new DocumentError("not_found");
    const holder = await tx.chat.findFirst({ where: { documentId }, select: { id: true, deletedAt: true } });
    if (holder && !holder.deletedAt) return { chatId: holder.id, created: false };
    const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId }, select: { title: true } });
    await tx.chat.createMany({ data: [{ id: chatId, profileId, userId, title: doc.title }], skipDuplicates: true });
    const chat = await tx.chat.findFirst({ where: { id: chatId, profileId, deletedAt: null }, select: { documentId: true } });
    if (!chat) throw new DocumentError("not_found", "Chat not found.");
    if (chat.documentId) throw new DocumentError("EXISTING_POST");
    if (holder) await tx.chat.update({ where: { id: holder.id }, data: { documentId: null } });
    await tx.chat.update({ where: { id: chatId }, data: { documentId, title: doc.title } });
    return { chatId, created: true };
  });
}

export type { VersionSource };

/**
 * Marks a post as posted (or undoes it). Marking twice keeps the first time; undoing clears it. This only stores the
 * time: nothing is published anywhere. Returns the new `postedAt`, or `undefined` for a post that isn't this profile's.
 */
export async function setDocumentPosted(profileId: string, documentId: string, posted: boolean): Promise<{ postedAt: Date | null } | undefined> {
  const where = { id: documentId, profileId, deletedAt: null };
  // Raw so the post's "last edited" time doesn't move: marking it posted isn't an edit.
  if (posted) await prisma.$executeRaw`UPDATE "Document" SET "postedAt" = now() WHERE "id" = ${documentId} AND "profileId" = ${profileId} AND "deletedAt" IS NULL AND "postedAt" IS NULL`;
  else await prisma.$executeRaw`UPDATE "Document" SET "postedAt" = NULL WHERE "id" = ${documentId} AND "profileId" = ${profileId} AND "deletedAt" IS NULL AND "postedAt" IS NOT NULL`;
  const doc = await prisma.document.findFirst({ where, select: { postedAt: true } });
  return doc ?? undefined;
}

/**
 * What style learning compares: a base text and the current text. The base is the newest AI-written version, or, with
 * `sinceVersion` (the document version already learned from), the text of that version, so only newer edits are read.
 * Null when the post isn't the profile's, has no AI version, or nothing is newer than `sinceVersion`.
 */
export async function getEditPair(
  profileId: string,
  id: string,
  sinceVersion?: number,
): Promise<{ aiText: string; userText: string; currentSource: VersionSource; currentAt: Date; currentVersion: number } | null> {
  const doc = await prisma.document.findFirst({ where: { id, profileId, deletedAt: null }, select: { version: true } });
  if (!doc) return null;
  if (sinceVersion !== undefined && doc.version <= sinceVersion) return null;
  const [current, ai, since] = await Promise.all([
    prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: doc.version } } }),
    prisma.documentVersion.findFirst({ where: { documentId: id, source: { in: ["AI_CREATE", "AI_EDIT", "PROPOSAL"] } }, orderBy: { version: "desc" } }),
    sinceVersion === undefined ? null : prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: sinceVersion } } }),
  ]);
  const base = since ?? ai;
  return current && base ? { aiText: base.text, userText: current.text, currentSource: current.source, currentAt: current.createdAt, currentVersion: doc.version } : null;
}
