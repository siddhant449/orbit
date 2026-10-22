import {
  ChatError,
  RUN_LOCK_STALE_MS,
  deleteChat,
  getAiModelPref,
  setAiModelPref,
  getChat,
  getChatDocument,
  listChats,
  listMessages,
  renameChat,
  requestStop,
  setChatPinned,
} from "@brandloop/db";
import {
  ChatRequestSchema,
  UI_MESSAGE_STREAM_HEADERS,
  chatError,
  chatErrorResponse,
  getRunRegistry,
  runChatTurn,
} from "@brandloop/agent";
import { z } from "zod";
import { CHAT_MODELS, isChatModel } from "@brandloop/ai";
import { getAccount } from "@/lib/account";
import { getChatDeps, isMockMode } from "@/lib/chat-deps";
import { checkAttachments, readCappedJson } from "@/lib/chat-request";
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
  const read = await readCappedJson(request);
  if (!read.ok) {
    return read.tooLarge ? chatError("request_too_large", "That request is too large.", 413) : badRequest();
  }
  const parsed = ChatRequestSchema.safeParse(read.value);
  if (!parsed.success) return badRequest();
  const body = checkAttachments(parsed.data);
  if (!body) return badRequest("Attachments must be files uploaded to Brandloop.");
  if (body.model != null && !isChatModel(body.model)) return badRequest("That model isn't available.");
  const saved = await getAiModelPref(ids.profileId);
  const model = body.model ?? (isChatModel(saved) ? saved : null);
  return runChatTurn(getChatDeps(model), ids, body);
}

/** GET /api/chat/:id/stream: replay and tail the active run on this instance, or 204. */
export async function getChatStreamHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const { id } = await params;
  if (!(await getChat(ids.profileId, id))) return notFound();
  const stream = getRunRegistry().replay(id);
  if (!stream) return new Response(null, { status: 204 });
  return new Response(stream.pipeThrough(new TextEncoderStream()), { headers: UI_MESSAGE_STREAM_HEADERS });
}

const STOP_BODY_BYTES = 8_192;
const StopSchema = z.object({ chatId: z.string().min(1).max(200), runId: z.string().min(1).max(200) });

/** POST /api/chat/stop: abort here if the run is local, and flag it for other instances. Always 200. */
export async function stopChatHandler(request: Request): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const read = await readCappedJson(request, STOP_BODY_BYTES);
  if (!read.ok) return read.tooLarge ? chatError("request_too_large", "That request is too large.", 413) : badRequest();
  const parsed = StopSchema.safeParse(read.value);
  if (!parsed.success) return badRequest();
  const { chatId, runId } = parsed.data;
  if (!(await getChat(ids.profileId, chatId))) return Response.json({ stopped: false });
  const local = getRunRegistry().abort(chatId, runId);
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
  const [messages, doc] = await Promise.all([listMessages(ids.profileId, id), getChatDocument(ids.profileId, id)]);
  const fresh =
    chat.activeRunId && (!chat.activeRunStartedAt || Date.now() - chat.activeRunStartedAt.getTime() < RUN_LOCK_STALE_MS);
  return Response.json({
    messages: messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts, metadata: m.metadata ?? undefined })),
    activeTurn: fresh ? { runId: chat.activeRunId, requestMessageId: chat.activeRequestMessageId } : null,
    document: doc ? { id: doc.id, title: doc.title, version: doc.version, text: doc.text } : null,
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

/** GET /api/ai-model: the profile's chosen chat model (null: the default) and the models on offer. */
export async function getAiModelHandler(): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const saved = await getAiModelPref(ids.profileId);
  return Response.json({ model: isChatModel(saved) ? saved : null, default: CHAT_MODELS[0].id, models: CHAT_MODELS });
}

/** PUT /api/ai-model {model}: saves the pick for this profile after checking the allowlist. null resets to the default. */
export async function putAiModelHandler(request: Request): Promise<Response> {
  const ids = await currentIds();
  if (!ids) return noProfile();
  const parsed = z.object({ model: z.string().nullable() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.model !== null && !isChatModel(parsed.data.model))) return badRequest("That model isn't available.");
  await setAiModelPref(ids.profileId, parsed.data.model);
  return Response.json({ model: parsed.data.model });
}
