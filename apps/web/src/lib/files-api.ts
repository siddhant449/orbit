import { getObject, softDeleteObject } from "@brandloop/db";
import { IMAGE_TYPES, resolveUploadMime, verifyUpload } from "@brandloop/knowledge";
import { isValidKey, normaliseImage } from "@brandloop/storage";
import { getAccount } from "@/lib/account";
import { getStores, readFile, storeFile } from "@/lib/storage";

/** Handlers behind /api/files (design F4 §8). Every read and write is scoped to the current profile: another profile's file is a 404. */

export const FILE_LIMITS = { imageBytes: 8 * 1024 * 1024, pdfBytes: 100 * 1024 * 1024 } as const;
const SLACK_BYTES = 1024 * 1024;

const fail = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });
type Ctx = { params: Promise<{ id: string }> };

/** multipart/form-data with `file`. Post media: JPG, PNG, GIF or WebP up to 8 MB, or a PDF up to 100 MB. */
export async function postFileHandler(request: Request): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(400, "Create a profile first");

  const declared = request.headers.get("content-length");
  const length = declared === null ? NaN : Number(declared);
  if (!Number.isFinite(length) || length < 0) return fail(411, "Upload size is required");
  if (length > FILE_LIMITS.pdfBytes + SLACK_BYTES) return fail(413, "That file is too large");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Choose a file to upload");

  const mime = resolveUploadMime(file.name, file.type);
  const isImage = !!mime && mime in IMAGE_TYPES;
  if (!mime || !(isImage || mime === "application/pdf")) return fail(400, "That file type isn't supported. Use JPG, PNG, GIF, WebP or PDF.");
  if (file.size === 0) return fail(400, "That file is empty");
  const max = isImage ? FILE_LIMITS.imageBytes : FILE_LIMITS.pdfBytes;
  if (file.size > max) return fail(413, `Files must be under ${max / 1024 / 1024} MB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const trusted = verifyUpload(bytes, mime);
  if (!trusted) return fail(415, "That file doesn't match its type");

  try {
    // Images are re-encoded: metadata (EXIF/GPS) is stripped and the longest side capped.
    const out = trusted in IMAGE_TYPES ? await normaliseImage(bytes) : { bytes, contentType: trusted };
    const stored = await storeFile(profile.id, profile.teamId, "POST_MEDIA", out.bytes, out.contentType);
    const row = await getObject(profile.id, stored.id);
    return Response.json(
      { id: stored.id, url: stored.url, contentType: out.contentType, bytes: out.bytes.length, width: row?.width ?? null, height: row?.height ?? null },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && /Unsupported image format|Input buffer|corrupt|unsupported image/i.test(err.message)) {
      return fail(415, "That file doesn't match its type");
    }
    throw err;
  }
}

/** Streams a live object to its owner. Private objects are never cached. */
export async function getFileHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(404, "File not found");
  const found = await readFile(profile.id, (await params).id);
  if (!found) return fail(404, "File not found");
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "content-type": found.contentType,
      "content-length": String(found.bytes.length),
      "cache-control": found.object.store === "PRIVATE" ? "private, no-store" : "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function deleteFileHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(404, "File not found");
  const removed = await softDeleteObject(profile.id, (await params).id);
  return removed ? new Response(null, { status: 204 }) : fail(404, "File not found");
}

/**
 * Dev only: serves the local public store by key (the hosted bucket serves its own URLs). 404 in production, for any
 * key that is not a well-formed public key, and for private files (they live in a different store).
 */
export async function publicFileHandler(_request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
  if (process.env.NODE_ENV === "production") return fail(404, "File not found");
  const key = (await params).key.join("/");
  if (!isValidKey(key)) return fail(404, "File not found");
  const found = await getStores().public.get(key).catch(() => null);
  if (!found || getStores().driver !== "local") return fail(404, "File not found");
  return new Response(new Uint8Array(found.bytes), {
    headers: { "content-type": found.contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
