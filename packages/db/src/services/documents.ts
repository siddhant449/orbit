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

/** The save carried an `expectedVersion` that is no longer current. */
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
  version: number;
  text: string;
  hook: string | null;
  chatId: string | null;
  updatedAt: Date;
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
    version: doc.version,
    text: current.text,
    hook: current.hook,
    chatId: doc.chat && !doc.chat.deletedAt ? doc.chat.id : null,
    updatedAt: doc.updatedAt,
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

type SaveInput = {
  text: string;
  title?: string;
  /** Omitted keeps the current hook; null clears it (restores use this). */
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
 * Writes version `expectedVersion + 1`. The compare-and-set on `Document.version` and the unique
 * `(documentId, version)` both reject a stale writer with `DocumentVersionConflict`; the newer text stays.
 */
export async function saveDocumentVersion(profileId: string, id: string, input: SaveInput): Promise<DocumentSnapshot> {
  const text = checkText(input.text);
  const title = input.title === undefined ? undefined : cleanTitle(input.title);
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.proposalId && (await proposalApplied(tx, id, input.proposalId))) throw new DocumentError("already_applied");
      const { count } = await tx.document.updateMany({
        where: { id, profileId, deletedAt: null, version: input.expectedVersion },
        data: { version: input.expectedVersion + 1, ...(title ? { title } : {}) },
      });
      if (count === 0) {
        const doc = await tx.document.findFirst({ where: { id, profileId, deletedAt: null }, select: { version: true } });
        if (!doc) throw new DocumentError("not_found");
        // A concurrent apply of the same proposal won the version: report that, not a generic conflict.
        if (input.proposalId && (await proposalApplied(tx, id, input.proposalId))) throw new DocumentError("already_applied");
        throw new DocumentVersionConflict(doc.version);
      }
      let hook: string | null;
      if (input.hook === undefined) {
        const prev = await tx.documentVersion.findUnique({
          where: { documentId_version: { documentId: id, version: input.expectedVersion } },
          select: { hook: true },
        });
        hook = prev?.hook ?? null;
      } else {
        hook = input.hook?.trim() || null;
      }
      await tx.documentVersion.create({
        data: {
          documentId: id,
          version: input.expectedVersion + 1,
          text,
          hook,
          source: input.source,
          changeSummary: cleanSummary(input.changeSummary),
          proposalId: input.proposalId ?? null,
        },
      });
      return (await snapshot(tx, profileId, id))!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      if (input.proposalId && (await proposalApplied(prisma, id, input.proposalId))) throw new DocumentError("already_applied");
      const doc = await prisma.document.findFirst({ where: { id, profileId }, select: { version: true } });
      throw new DocumentVersionConflict(doc?.version ?? input.expectedVersion + 1);
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

/** Copies an old version's text and hook into a new RESTORE version. History is never rewritten. */
export async function restoreDocumentVersion(
  profileId: string,
  id: string,
  version: number,
  expectedVersion: number,
): Promise<DocumentSnapshot> {
  const old = await prisma.documentVersion.findFirst({
    where: { version, document: { id, profileId, deletedAt: null } },
    select: { text: true, hook: true },
  });
  if (!old) throw new DocumentError("not_found", "That version doesn't exist.");
  return saveDocumentVersion(profileId, id, {
    text: old.text,
    hook: old.hook,
    source: "RESTORE",
    changeSummary: `Restored version ${version}`,
    expectedVersion,
  });
}

export type { VersionSource };
