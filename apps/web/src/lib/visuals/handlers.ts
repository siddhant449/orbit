import {
  createVisualWithDebit, getReference, deleteVisual, getActiveForDocument, getCredits, getTheme, getVisual, listVisuals, OutOfCreditsError, prisma,
  updateAltText, VisualError, ALT_TEXT_MAX, type LibraryItem, type VisualWithCurrent,
} from "@brandloop/db";
import { checkVisualRequest } from "@brandloop/visuals";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { enqueue } from "@/lib/jobs";
import { getVisualDeps, visualsEnabled } from "./deps";

/**
 * Handlers behind /api/visuals, /api/credits (design F5 §5). Every read and write is scoped to the signed-in user's
 * current profile, so another profile's visual is a 404; credits are team-wide. Errors are `{error}` plus `code` on
 * 402/409/422/503.
 */

type Ctx = { params: Promise<{ id: string }> };

export const fail = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });
export const notFound = () => fail(404, "Image not found.");

export async function currentProfile() {
  return (await getAccount())?.currentProfile ?? null;
}

export function visualJson(v: VisualWithCurrent["visual"], current: VisualWithCurrent["current"]) {
  return {
    id: v.id,
    // An edit or logo in flight keeps the image on screen but reads as busy, so one poll loop covers every operation.
    status: v.activeOp && v.status === "COMPLETED" ? "PROCESSING" : v.status,
    imageUrl: v.status === "FAILED" || (v.status === "PENDING" && !current) ? null : (current?.storageObject.url ?? null),
    currentVersion: v.currentVersion,
    editCount: v.editCount,
    maxEdits: v.maxEdits,
    remainingEdits: Math.max(0, v.maxEdits - v.editCount),
    error: v.error,
    aspect: v.aspect,
    type: v.type,
    altText: v.altText,
    documentId: v.documentId,
    activeOp: v.activeOp,
    createdAt: v.createdAt.toISOString(),
  };
}

const libraryJson = (v: LibraryItem) => ({
  ...visualJson(v, v.versions[0] ?? null),
  documentTitle: v.document?.title ?? null,
});

const Create = z.object({
  source: z.enum(["post", "library"]),
  documentId: z.string().min(1).max(64).optional(),
  prompt: z.string().trim().min(1).max(2_000),
  visualType: z.enum(["INFOGRAPHIC", "BEFORE_AFTER", "QUOTE", "GENERAL"]),
  aspect: z.enum(["SQUARE", "PORTRAIT_4_5", "PORTRAIT_2_3", "LANDSCAPE_3_2"]).default("PORTRAIT_4_5"),
  useBrandColours: z.boolean().default(true),
  customInstructions: z.string().trim().max(1_000).optional(),
  referenceId: z.string().min(1).max(64).optional(),
  requestId: z.string().min(8).max(64),
});

/**
 * POST /api/visuals. In order: auth, feature switch, validation, post check, brand-colour decision, SAFETY CHECK,
 * debit, enqueue. Nothing before the debit spends a credit or reaches a provider, and the safety check comes before it.
 */
export async function createVisualHandler(request: Request): Promise<Response> {
  const account = await getAccount();
  const profile = account?.currentProfile;
  if (!profile) return fail(400, "Create a profile first.");
  if (!visualsEnabled()) return fail(503, "Image generation is paused right now.", { code: "visuals_disabled" });

  const parsed = Create.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return fail(400, "That image request isn't valid.");
  const input = parsed.data;

  if (input.source === "post") {
    const doc = input.documentId
      ? await prisma.document.findFirst({ where: { id: input.documentId, profileId: profile.id, deletedAt: null }, select: { id: true } })
      : null;
    if (!doc) return fail(422, "Save the post first, then add an image.", { code: "post_required" });
  }

  if (input.useBrandColours) {
    const theme = await getTheme(profile.id);
    if (theme.decision === "NONE") {
      return fail(409, "Set your brand colours first, or skip them.", { code: "needs_brand_confirmation", proposal: theme });
    }
  }

  if (input.referenceId && !(await getReference(profile.id, input.referenceId))) {
    return fail(422, "That reference image isn't available.", { code: "reference_not_found" });
  }

  const deps = getVisualDeps();
  const verdict = await checkVisualRequest(deps.ai, [input.prompt, input.customInstructions].filter(Boolean).join("\n"), { log: deps.log });
  if (!verdict.allowed) return fail(422, verdict.message, { code: "refused", category: verdict.category });

  try {
    const { visual, balance } = await createVisualWithDebit({
      profileId: profile.id,
      teamId: profile.teamId,
      userId: account.user.id,
      requestId: input.requestId,
      documentId: input.source === "post" ? input.documentId : null,
      type: input.visualType,
      aspect: input.aspect,
      userPrompt: input.prompt,
      customInstructions: input.customInstructions ?? null,
      useBrandColours: input.useBrandColours,
      referenceId: input.referenceId ?? null,
    });
    // A retried POST re-enqueues: the dedupe id and the job's compare-and-set make that harmless, and it rescues a
    // first attempt that debited but died before queueing.
    if (visual.status === "PENDING") await enqueue("visual.generate", { visualId: visual.id }, { dedupeId: `visual:${visual.id}:generate` });
    return Response.json({ visual: visualJson(visual, null), balance }, { status: 202 });
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      return fail(402, "You're out of image credits for now.", { code: "out_of_credits", balance: err.balance, refillsAt: err.refillsAt.toISOString() });
    }
    if (err instanceof VisualError) {
      if (err.code === "in_progress") return fail(409, "An image is already being made for this post.", { code: "visual_in_progress" });
      if (err.code === "not_found") return fail(422, "Save the post first, then add an image.", { code: "post_required" });
    }
    throw err;
  }
}

/** GET /api/visuals?cursor&documentId&limit: the library, newest first. */
export async function listVisualsHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));
  const page = await listVisuals(profile.id, {
    cursor: url.searchParams.get("cursor") ?? undefined,
    documentId: url.searchParams.get("documentId") ?? undefined,
    limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
  });
  return Response.json({ items: page.items.map(libraryJson), nextCursor: page.nextCursor });
}

/** GET /api/visuals/:id: the polling endpoint. */
export async function getVisualHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const found = await getVisual(profile.id, (await params).id);
  return found ? Response.json(visualJson(found.visual, found.current)) : notFound();
}

/** GET /api/visuals/active?documentId=: resume a running operation when the editor mounts. */
export async function getActiveHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return fail(400, "documentId is required.");
  const active = await getActiveForDocument(profile.id, documentId);
  if (!active) return Response.json({ active: false, isEdit: false, visual: null });
  const found = await getVisual(profile.id, active.id);
  return Response.json({
    active: true,
    isEdit: active.activeOp !== "generate",
    visual: found ? visualJson(found.visual, found.current) : null,
    // While an edit runs the panel keeps showing the image being edited.
    sourceImageUrl: active.activeOp !== "generate" ? (found?.current?.storageObject.url ?? null) : null,
  });
}

const Patch = z.object({ altText: z.string().max(ALT_TEXT_MAX).nullable() });

/** PATCH /api/visuals/:id {altText}. */
export async function patchVisualHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const parsed = Patch.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return fail(400, `Alt text can be at most ${ALT_TEXT_MAX} characters.`);
  const id = (await params).id;
  if (!(await updateAltText(profile.id, id, parsed.data.altText))) return notFound();
  const found = await getVisual(profile.id, id);
  return found ? Response.json(visualJson(found.visual, found.current)) : notFound();
}

/** DELETE /api/visuals/:id: soft delete. */
export async function deleteVisualHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  return (await deleteVisual(profile.id, (await params).id)) ? new Response(null, { status: 204 }) : notFound();
}

/** GET /api/credits: the team's balance (lazy refill on read). */
export async function creditsHandler(): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const c = await getCredits(profile.teamId);
  return Response.json({
    balance: c.balance,
    monthlyAllocation: c.monthlyAllocation,
    periodStartedAt: c.periodStartedAt.toISOString(),
    refillsAt: c.refillsAt.toISOString(),
    hasAddon: false,
  });
}
