import {
  ChatError,
  RUN_LOCK_STALE_MS,
  deleteChat,
  getChat,
  listChats,
  listMessages,
  renameChat,
  requestStop,
  setChatPinned,
} from "@brandloop/db";
import { ChatRequestSchema, UI_MESSAGE_STREAM_HEADERS, chatError, chatErrorResponse, runChatTurn } from "@brandloop/agent";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { getChatDeps, isMockMode } from "@/lib/chat-deps";
import { AI_UNAVAILABLE_MESSAGE } from "@/lib/run-job";

/**
 * Handlers behind the chat routes (design §5). Routes stay one-liners; everything here is scoped to the
 * signed-in user's current profile, so another profile's chat is always a 404. Errors use `{code, cause}`.
 */

type Ctx = { params: Promise<{ id: string }> };

const noProfile = () => chatError("no_profile", "Create a profile first.", 400);
const badRequest = (cause = "That request isn't valid.") => chatError("bad_request", cause, 400);
const notFound = () => chatError("chat_not_found", "Chat not found.", 404);

async function currentIds(): Promise<{ userId: string; profileId: string } | null> {
  const { user, currentProfile } = await getAccount();
  return currentProfile ? { userId: user.id, profileId: currentProfile.id } : null;
}

function fromError(err: unknown): Response {
  if (err instanceof ChatError) return chatErrorResponse(err);
  throw err;
}

/** POST /api/chat: one turn, streamed as a UI message stream. */
export async function postChatHandler(request: Request): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  if (!isMockMode() && !process.env.OPENAI_API_KEY) return chatError("ai_unavailable", AI_UNAVAILABLE_MESSAGE, 503);
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest();
  return runChatTurn(getChatDeps(), ids, parsed.data);
}

/** GET /api/chat/:id/stream: replay and tail the active run on this instance, or 204. */
export async function getChatStreamHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const { id } = await params;
  if (!(await getChat(ids.profileId, id))) return notFound();
  const stream = getChatDeps().registry.replay(id);
  if (!stream) return new Response(null, { status: 204 });
  return new Response(stream.pipeThrough(new TextEncoderStream()), { headers: UI_MESSAGE_STREAM_HEADERS });
}

const StopSchema = z.object({ chatId: z.string().min(1).max(200), runId: z.string().min(1).max(200) });

/** POST /api/chat/stop: abort here if the run is local, and flag it for other instances. Always 200. */
export async function stopChatHandler(request: Request): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const parsed = StopSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest();
  const { chatId, runId } = parsed.data;
  if (!(await getChat(ids.profileId, chatId))) return Response.json({ stopped: false });
  const local = getChatDeps().registry.abort(chatId, runId);
  const flagged = await requestStop(ids.profileId, chatId, runId);
  return Response.json({ stopped: local || flagged });
}

/** GET /api/chat/:id/messages: the stored conversation, the active turn (if fresh) and the open document. */
export async function getChatMessagesHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const { id } = await params;
  const chat = await getChat(ids.profileId, id);
  if (!chat) return notFound();
  const messages = await listMessages(ids.profileId, id);
  const fresh =
    chat.activeRunId && (!chat.activeRunStartedAt || Date.now() - chat.activeRunStartedAt.getTime() < RUN_LOCK_STALE_MS);
  return Response.json({
    messages: messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts, metadata: m.metadata ?? undefined })),
    activeTurn: fresh ? { runId: chat.activeRunId, requestMessageId: chat.activeRequestMessageId } : null,
    // The documents task fills this in.
    document: null,
  });
}

const PatchSchema = z
  .object({ title: z.string().trim().min(1).max(120).optional(), pinned: z.boolean().optional() })
  .refine((b) => b.title !== undefined || b.pinned !== undefined, "Send a title or pinned.");

/** PATCH /api/chat/:id: rename and/or pin. */
export async function patchChatHandler(request: Request, { params }: Ctx): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Send a title (1 to 120 characters) or pinned (true or false).");
  const { id } = await params;
  try {
    if (parsed.data.title !== undefined) await renameChat(ids.profileId, id, parsed.data.title);
    if (parsed.data.pinned !== undefined) await setChatPinned(ids.profileId, id, parsed.data.pinned);
  } catch (err) {
    return fromError(err);
  }
  return Response.json({ success: true });
}

/** DELETE /api/chat/:id: soft delete. */
export async function deleteChatHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  try {
    await deleteChat(ids.profileId, (await params).id);
  } catch (err) {
    return fromError(err);
  }
  return Response.json({ success: true });
}

const HistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.string().min(1).max(200).optional(),
});

/** GET /api/history?limit=20&before=<chatId>: pinned first, then newest activity. */
export async function getHistoryHandler(request: Request): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const search = new URL(request.url).searchParams;
  const parsed = HistorySchema.safeParse({
    limit: search.get("limit") ?? undefined,
    before: search.get("before") ?? undefined,
  });
  if (!parsed.success) return badRequest();
  return Response.json(await listChats(ids.profileId, parsed.data));
}
