import { prisma } from "../client";
import { Prisma } from "../generated/prisma/client";
import type { Chat, ChatRole } from "../generated/prisma/client";

export type ActiveTurn = { runId: string; requestMessageId: string | null };

export type ChatErrorCode = "chat_not_found" | "chat_turn_active" | "message_id_conflict";

export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly activeTurn?: ActiveTurn;

  constructor(code: ChatErrorCode, activeTurn?: ActiveTurn) {
    super(
      code === "chat_turn_active"
        ? "This chat already has a reply in progress."
        : code === "message_id_conflict"
          ? "That message id belongs to another message."
          : "Chat not found.",
    );
    this.name = "ChatError";
    this.code = code;
    this.activeTurn = activeTurn;
  }
}

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: unknown[];
  metadata: unknown;
  context: unknown;
  createdAt: Date;
};
export type ChatSummary = { id: string; title: string; pinned: boolean; lastActivityAt: Date; documentId: string | null };

type MessageInput = { id: string; parts: unknown[]; metadata: unknown; context: unknown };

/** A run lock older than this is treated as abandoned (the instance that held it died). */
export const RUN_LOCK_STALE_MS = 6 * 60_000;
const DEFAULT_TITLE = "New chat";

function optionalJson(v: unknown) {
  // Prisma wants a sentinel for a SQL NULL in a Json column; omit the field instead.
  return v === null || v === undefined ? undefined : (v as Prisma.InputJsonValue);
}

/** The chat, only when it belongs to the profile and is not deleted. */
export function getChat(profileId: string, chatId: string): Promise<Chat | null> {
  return prisma.chat.findFirst({ where: { id: chatId, profileId, deletedAt: null } });
}

async function requireChat(profileId: string, chatId: string): Promise<Chat> {
  const chat = await getChat(profileId, chatId);
  if (!chat) throw new ChatError("chat_not_found");
  return chat;
}

/**
 * Returns the profile's chat with this client-chosen id, creating it on first use. An id that exists under
 * another profile, or was deleted, is `chat_not_found`. Parallel first calls create exactly one row.
 */
export async function getOrCreateChat(
  profileId: string,
  userId: string,
  chatId: string,
): Promise<{ chat: Chat; created: boolean }> {
  const { count } = await prisma.chat.createMany({ data: [{ id: chatId, profileId, userId }], skipDuplicates: true });
  const chat = await getChat(profileId, chatId);
  if (!chat) throw new ChatError("chat_not_found");
  return { chat, created: count === 1 };
}

/**
 * Takes the chat's single-turn lock in one conditional UPDATE: it succeeds only when nobody holds the lock
 * or the holder started more than 6 minutes before `now`. Otherwise throws `chat_turn_active`.
 */
export async function claimRun(chatId: string, runId: string, requestMessageId: string, now = new Date()): Promise<void> {
  const staleBefore = new Date(now.getTime() - RUN_LOCK_STALE_MS);
  // The loop only repeats when the holder released the lock between our UPDATE and our read.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count } = await prisma.chat.updateMany({
      where: {
        id: chatId,
        deletedAt: null,
        OR: [{ activeRunId: null }, { activeRunStartedAt: null }, { activeRunStartedAt: { lt: staleBefore } }],
      },
      data: {
        activeRunId: runId,
        activeRunStartedAt: now,
        activeRequestMessageId: requestMessageId,
        stopRequestedRunId: null,
      },
    });
    if (count === 1) return;
    const chat = await prisma.chat.findFirst({ where: { id: chatId, deletedAt: null } });
    if (!chat) throw new ChatError("chat_not_found");
    if (chat.activeRunId) {
      throw new ChatError("chat_turn_active", { runId: chat.activeRunId, requestMessageId: chat.activeRequestMessageId });
    }
  }
  // Still contended after retries: report whoever holds the lock now, if anyone.
  const holder = await prisma.chat.findFirst({ where: { id: chatId, deletedAt: null } });
  throw new ChatError(
    "chat_turn_active",
    holder?.activeRunId ? { runId: holder.activeRunId, requestMessageId: holder.activeRequestMessageId } : undefined,
  );
}

/** Frees the lock, but only for the run that holds it. Also clears any stop flag. */
export async function releaseRun(chatId: string, runId: string): Promise<void> {
  await prisma.chat.updateMany({
    where: { id: chatId, activeRunId: runId },
    data: { activeRunId: null, activeRunStartedAt: null, activeRequestMessageId: null, stopRequestedRunId: null },
  });
}

/** Flags the run to stop. True only when `runId` is the chat's active run. */
export async function requestStop(profileId: string, chatId: string, runId: string): Promise<boolean> {
  const { count } = await prisma.chat.updateMany({
    where: { id: chatId, profileId, deletedAt: null, activeRunId: runId },
    data: { stopRequestedRunId: runId },
  });
  return count === 1;
}

export async function isStopRequested(chatId: string, runId: string): Promise<boolean> {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { stopRequestedRunId: true } });
  return chat?.stopRequestedRunId === runId;
}

/** An id that already exists must be this chat's own message of this role, or the caller is colliding with another message. */
async function assertOwnsMessage(chatId: string, id: string, role: ChatRole): Promise<void> {
  const existing = await prisma.message.findUnique({ where: { id }, select: { chatId: true, role: true } });
  if (!existing || existing.chatId !== chatId || existing.role !== role) throw new ChatError("message_id_conflict");
}

/** Stores the user's message once per id. A retry returns `created: false` and changes nothing. */
export async function saveUserMessage(chatId: string, msg: MessageInput): Promise<{ created: boolean }> {
  const { count } = await prisma.message.createMany({
    data: [
      {
        id: msg.id,
        chatId,
        role: "USER",
        parts: msg.parts as Prisma.InputJsonValue,
        metadata: optionalJson(msg.metadata),
        context: optionalJson(msg.context),
      },
    ],
    skipDuplicates: true,
  });
  if (count === 1) {
    await prisma.chat.updateMany({ where: { id: chatId }, data: { lastActivityAt: new Date() } });
    return { created: true };
  }
  await assertOwnsMessage(chatId, msg.id, "USER");
  return { created: false };
}

/** Writes the assistant message, replacing the stored copy with the same id (partial saves, then the final). */
export async function saveAssistantMessage(chatId: string, msg: MessageInput & { runId: string }): Promise<void> {
  const data = {
    parts: msg.parts as Prisma.InputJsonValue,
    metadata: optionalJson(msg.metadata) ?? Prisma.DbNull,
    context: optionalJson(msg.context) ?? Prisma.DbNull,
    runId: msg.runId,
  };
  const { count } = await prisma.message.updateMany({ where: { id: msg.id, chatId, role: "ASSISTANT" }, data });
  if (count === 0) {
    const { count: inserted } = await prisma.message.createMany({
      data: [
        {
          id: msg.id,
          chatId,
          role: "ASSISTANT",
          parts: data.parts,
          metadata: optionalJson(msg.metadata),
          context: optionalJson(msg.context),
          runId: msg.runId,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted === 0) {
      // Someone else holds the id. If it is our own assistant message (a parallel writer), the last writer wins.
      await assertOwnsMessage(chatId, msg.id, "ASSISTANT");
      await prisma.message.updateMany({ where: { id: msg.id, chatId, role: "ASSISTANT" }, data });
    }
  }
  await prisma.chat.updateMany({ where: { id: chatId }, data: { lastActivityAt: new Date() } });
}

const toRole = (r: ChatRole): "user" | "assistant" => (r === "USER" ? "user" : "assistant");

export async function listMessages(profileId: string, chatId: string): Promise<StoredMessage[]> {
  await requireChat(profileId, chatId);
  const rows = await prisma.message.findMany({ where: { chatId }, orderBy: { seq: "asc" } });
  return rows.map((m) => ({
    id: m.id,
    role: toRole(m.role),
    parts: Array.isArray(m.parts) ? (m.parts as unknown[]) : [],
    metadata: m.metadata,
    context: m.context,
    createdAt: m.createdAt,
  }));
}

/** The `context` of the chat's latest assistant message (it carries the active task), or null. */
export async function lastAssistantContext(chatId: string): Promise<Record<string, unknown> | null> {
  const row = await prisma.message.findFirst({
    where: { chatId, role: "ASSISTANT" },
    orderBy: { seq: "desc" },
    select: { context: true },
  });
  const c = row?.context;
  return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : null;
}

/** Pinned chats first, then newest activity. `before` is the id of the last chat on the previous page. */
export async function listChats(
  profileId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<{ chats: ChatSummary[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  if (opts.before) {
    const cursor = await getChat(profileId, opts.before);
    if (!cursor) return { chats: [], hasMore: false };
  }
  const rows = await prisma.chat.findMany({
    where: { profileId, deletedAt: null },
    orderBy: [{ pinned: "desc" }, { lastActivityAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
    select: { id: true, title: true, pinned: true, lastActivityAt: true, documentId: true },
  });
  return { chats: rows.slice(0, limit), hasMore: rows.length > limit };
}

async function updateOwned(profileId: string, chatId: string, data: Prisma.ChatUpdateManyMutationInput) {
  const { count } = await prisma.chat.updateMany({ where: { id: chatId, profileId, deletedAt: null }, data });
  if (count === 0) throw new ChatError("chat_not_found");
}

export async function renameChat(profileId: string, chatId: string, title: string): Promise<void> {
  const t = title.trim();
  if (t.length < 1 || t.length > 120) throw new Error("Chat title must be 1 to 120 characters.");
  await updateOwned(profileId, chatId, { title: t });
}

export async function setChatPinned(profileId: string, chatId: string, pinned: boolean): Promise<void> {
  await updateOwned(profileId, chatId, { pinned });
}

/** Soft delete. The chat disappears from every read; its messages stay. */
export async function deleteChat(profileId: string, chatId: string): Promise<void> {
  await updateOwned(profileId, chatId, { deletedAt: new Date() });
}

/** Sets the auto-generated title, only while the chat still has the default one. */
export async function setTitleIfDefault(chatId: string, title: string): Promise<void> {
  const t = title.trim().slice(0, 120);
  if (!t) return;
  await prisma.chat.updateMany({ where: { id: chatId, title: DEFAULT_TITLE, deletedAt: null }, data: { title: t } });
}
