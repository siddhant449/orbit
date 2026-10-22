import {
  DOCUMENT_TEXT_MAX,
  DOCUMENT_TITLE_MAX,
  DocumentError,
  DocumentVersionConflict,
  getDocument,
  linkChatToDocument,
  listDocumentVersions,
  restoreDocumentVersion,
  saveDocumentVersion,
} from "@brandloop/db";
import { applyProposal, ProposalError } from "@brandloop/agent";
import { z } from "zod";
import { getAccount } from "@/lib/account";

/**
 * Handlers behind the document routes (design §5). Every read and write is scoped to the signed-in user's
 * current profile, so another profile's post is a 404. Errors are `{error}`, plus `code` on 409.
 */

type Ctx = { params: Promise<{ id: string }> };

const fail = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });
const notFound = () => fail(404, "Document not found.");
const conflict = (version: number) =>
  fail(409, "This post changed since you opened it. Reload it and try again.", { code: "document_version_conflict", version });

async function currentProfileId(): Promise<string | null> {
  return (await getAccount())?.currentProfile?.id ?? null;
}

async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

function fromError(err: unknown): Response {
  if (err instanceof DocumentVersionConflict) return conflict(err.currentVersion);
  if (err instanceof ProposalError) {
    if (err.code === "not_found") return fail(404, "That suggestion isn't available any more.");
    if (err.code === "already_applied") return fail(409, "That suggestion is already in the post.", { code: "already_applied" });
    return fail(409, "That passage isn't in the post any more, so the suggestion can't be applied.", { code: "stale_passage" });
  }
  if (err instanceof DocumentError) return err.code === "not_found" ? notFound() : fail(400, err.message);
  throw err;
}

const version = z.number().int().min(1);

/** GET /api/documents/:id: the post with its current text. */
export async function getDocumentHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profileId = await currentProfileId();
  if (!profileId) return fail(400, "Create a profile first.");
  const doc = await getDocument(profileId, (await params).id);
  return doc ? Response.json(doc) : notFound();
}

/** GET /api/documents/:id/versions: newest first, `{version, source, changeSummary, createdAt, chars, proposalId}`. */
export async function listVersionsHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profileId = await currentProfileId();
  if (!profileId) return fail(400, "Create a profile first.");
  try {
    return Response.json({ versions: await listDocumentVersions(profileId, (await params).id) });
  } catch (err) {
    return fromError(err);
  }
}

const PatchSchema = z.object({
  text: z.string().refine((t) => t.trim().length > 0 && t.length <= DOCUMENT_TEXT_MAX),
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX).optional(),
  expectedVersion: version,
});

/** PATCH /api/documents/:id: `{text, title?, expectedVersion}` saves a user edit. 200 `{version}` or 409. */
export async function patchDocumentHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profileId = await currentProfileId();
  if (!profileId) return fail(400, "Create a profile first.");
  const parsed = PatchSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return fail(
      400,
      `Send text (1 to ${DOCUMENT_TEXT_MAX.toLocaleString("en-US")} characters), an optional title (1 to ${DOCUMENT_TITLE_MAX}) and expectedVersion.`,
    );
  }
  try {
    const doc = await saveDocumentVersion(profileId, (await params).id, { ...parsed.data, source: "USER_EDIT" });
    return Response.json({ version: doc.version });
  } catch (err) {
    return fromError(err);
  }
}

const RestoreSchema = z.object({ version, expectedVersion: version });

/** POST /api/documents/:id/restore: `{version, expectedVersion}` writes a new RESTORE version. */
export async function restoreDocumentHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profileId = await currentProfileId();
  if (!profileId) return fail(400, "Create a profile first.");
  const parsed = RestoreSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Send version and expectedVersion as whole numbers.");
  try {
    return Response.json(await restoreDocumentVersion(profileId, (await params).id, parsed.data.version, parsed.data.expectedVersion));
  } catch (err) {
    return fromError(err);
  }
}

const ApplyProposalSchema = z.object({
  chatId: z.string().min(1).max(200),
  toolCallId: z.string().min(1).max(200),
  expectedVersion: version,
});

/**
 * POST /api/documents/:id/apply-proposal: `{chatId, toolCallId, expectedVersion}`. The passage and replacement come
 * from the proposal stored in the chat, never from the request. 200 snapshot, 409 `document_version_conflict`,
 * `stale_passage` or `already_applied`, 404 when the proposal or post isn't the caller's.
 */
export async function applyProposalHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profileId = await currentProfileId();
  if (!profileId) return fail(400, "Create a profile first.");
  const parsed = ApplyProposalSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Send chatId, toolCallId and expectedVersion.");
  try {
    return Response.json(await applyProposal(profileId, (await params).id, parsed.data));
  } catch (err) {
    return fromError(err);
  }
}

const LinkChatSchema = z.object({ chatId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/) });

/**
 * POST /api/documents/:id/chat: `{chatId}` gives the post editor its chat. The post's live chat comes back as is;
 * a post without one gets `chatId` as a new chat linked to it. 200 `{chatId}`; 404 for another profile's post;
 * 409 `existing_post` when `chatId` already belongs to another post.
 */
export async function linkChatHandler(request: Request, { params }: Ctx): Promise<Response> {
  const account = await getAccount();
  const profileId = account?.currentProfile?.id;
  if (!profileId) return fail(400, "Create a profile first.");
  const parsed = LinkChatSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, "Send chatId.");
  try {
    const { chatId } = await linkChatToDocument(profileId, account.user.id, parsed.data.chatId, (await params).id);
    return Response.json({ chatId });
  } catch (err) {
    if (err instanceof DocumentError && err.code === "EXISTING_POST") {
      return fail(409, "That chat already has a post.", { code: "existing_post" });
    }
    return fromError(err);
  }
}
