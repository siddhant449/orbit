import { attachVisual, detachVisual, listMedia, PostMediaError, POST_MEDIA_MAX, prisma, type PostMedia } from "@brandloop/db";
import { z } from "zod";
import { currentProfile, fail, notFound } from "./handlers";

type Ctx = { params: Promise<{ id: string }> };

const mediaJson = (m: PostMedia) => ({
  id: m.id,
  documentId: m.documentId,
  visualId: m.visualId,
  position: m.position,
  altText: m.altText,
  frozen: m.frozenAt !== null,
});

const Body = z.object({ documentId: z.string().min(1).max(64) });

/** POST /api/visuals/:id/attach {documentId}: puts the visual's current version on the post (idempotent). */
export async function attachHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const body = Body.safeParse(await request.json().catch(() => undefined));
  if (!body.success) return fail(400, "Choose a post.");
  try {
    return Response.json({ media: mediaJson(await attachVisual(profile.id, (await params).id, body.data.documentId)) });
  } catch (err) {
    if (err instanceof PostMediaError) {
      if (err.code === "not_found") return notFound();
      if (err.code === "not_ready") return fail(409, "This image isn't ready yet.", { code: "visual_not_ready" });
      return fail(422, `A post can have up to ${POST_MEDIA_MAX} images.`, { code: "media_limit" });
    }
    throw err;
  }
}

/** DELETE /api/visuals/:id/attach?documentId=: takes it off a draft post. */
export async function detachHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return fail(400, "Choose a post.");
  return (await detachVisual(profile.id, (await params).id, documentId)) ? new Response(null, { status: 204 }) : notFound();
}

/** GET /api/documents/:id/media: the post's attached media in order, with each file's URL (so a reload shows what is attached). */
export async function listMediaHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(404, "Post not found.");
  const documentId = (await params).id;
  const media = await listMedia(profile.id, documentId);
  if (media.length === 0 && !(await prisma.document.findFirst({ where: { id: documentId, profileId: profile.id, deletedAt: null }, select: { id: true } }))) {
    return fail(404, "Post not found.");
  }
  const objects = await prisma.storageObject.findMany({ where: { id: { in: media.map((m) => m.storageObjectId) } } });
  return Response.json({
    media: media.map((m) => {
      const o = objects.find((x) => x.id === m.storageObjectId);
      return { ...mediaJson(m), url: o?.url ?? null, width: o?.width ?? null, height: o?.height ?? null, contentType: o?.contentType ?? null };
    }),
  });
}
