import {
  createReference, deleteReference, listReferences, listTags, normaliseTags, REFERENCE_TITLE_MAX, ReferenceError, softDeleteObject,
  type ReferenceImage,
} from "@brandloop/db";
import { normaliseImage } from "@brandloop/storage";
import { storeFile } from "@/lib/storage";
import { currentProfile, fail, notFound } from "./handlers";
import { isResponse, readImageUpload } from "./uploads";

/** Reference images: examples the user keeps to steer generation. Always the PRIVATE store, served only via /api/files/:id. */

const item = (r: ReferenceImage) => ({
  id: r.id,
  title: r.title,
  tags: r.tags,
  width: r.width,
  height: r.height,
  createdAt: r.createdAt.toISOString(),
  // Thumbnails render through the profile-checked file route, never a public URL.
  url: `/api/files/${r.storageObjectId}`,
});

export async function listReferencesHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const url = new URL(request.url);
  const items = await listReferences(profile.id, { tag: url.searchParams.get("tag") ?? undefined, q: url.searchParams.get("q") ?? undefined });
  return Response.json({ items: items.map(item) });
}

function tagsFrom(form: FormData): string[] {
  return form.getAll("tags").flatMap((v) => (typeof v === "string" ? v.split(",") : []));
}

/** POST /api/reference-images (multipart `file`, `title`, `tags`): JPG, PNG, GIF or WebP up to 8 MB. */
export async function postReferenceHandler(request: Request): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  const upload = await readImageUpload(request, {
    maxBytes: 8 * 1024 * 1024,
    allowed: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    label: "Images",
  });
  if (isResponse(upload)) return upload;
  const title = String(upload.form.get("title") ?? "");
  const tags = tagsFrom(upload.form);
  // Validate the text fields before any file is written.
  try {
    if (!title.trim()) throw new ReferenceError("Add a title");
    if (title.trim().length > REFERENCE_TITLE_MAX) throw new ReferenceError(`Titles can be at most ${REFERENCE_TITLE_MAX} characters`);
    normaliseTags(tags);
  } catch (err) {
    if (err instanceof ReferenceError) return fail(400, err.message);
    throw err;
  }
  let image;
  try {
    image = await normaliseImage(upload.bytes, { maxSide: 2048, format: upload.mime === "image/gif" ? "png" : undefined });
  } catch {
    return fail(415, "That file doesn't match its type.");
  }
  const stored = await storeFile(profile.id, profile.teamId, "REFERENCE", image.bytes, image.contentType);
  try {
    const ref = await createReference(profile.id, { title, tags, storageObjectId: stored.id, width: image.width, height: image.height });
    return Response.json({ item: item(ref) }, { status: 201 });
  } catch (err) {
    await softDeleteObject(profile.id, stored.id).catch(() => undefined);
    if (err instanceof ReferenceError) return fail(400, err.message);
    throw err;
  }
}

export async function deleteReferenceHandler(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  return (await deleteReference(profile.id, (await params).id)) ? new Response(null, { status: 204 }) : fail(404, "Reference not found.");
}

export async function tagsHandler(): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return fail(400, "Create a profile first.");
  return Response.json({ tags: await listTags(profile.id) });
}

