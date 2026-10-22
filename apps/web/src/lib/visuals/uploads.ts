import { IMAGE_TYPES, resolveUploadMime, verifyUpload } from "@brandloop/knowledge";
import { fail } from "./handlers";

export type ImageUpload = { bytes: Buffer; mime: string; form: FormData; name: string };

const SLACK = 1024 * 1024;

/**
 * Reads a multipart image upload with the checks every image route shares: declared length present and sane, a `file`
 * field, a supported type (SVG is refused: script risk), a size cap, and magic bytes that match the declared type.
 * Returns the bytes or the error response to send.
 */
export async function readImageUpload(
  request: Request,
  opts: { maxBytes: number; allowed: string[]; label: string },
): Promise<ImageUpload | Response> {
  const declared = request.headers.get("content-length");
  const length = declared === null ? NaN : Number(declared);
  if (!Number.isFinite(length) || length < 0) return fail(411, "Upload size is required.");
  if (length > opts.maxBytes + SLACK) return fail(413, `${opts.label} must be under ${opts.maxBytes / 1024 / 1024} MB.`);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Choose an image to upload.");
  if (file.size === 0) return fail(400, "That file is empty.");
  if (file.size > opts.maxBytes) return fail(413, `${opts.label} must be under ${opts.maxBytes / 1024 / 1024} MB.`);

  const head = Buffer.from(await file.slice(0, 512).arrayBuffer()).toString("latin1").trimStart().toLowerCase();
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name) || head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return fail(415, "SVG files aren't supported. Upload a PNG, JPG or WebP.");
  }
  const mime = resolveUploadMime(file.name, file.type);
  if (!mime || !(mime in IMAGE_TYPES) || !opts.allowed.includes(mime)) {
    return fail(415, `That file type isn't supported. Use ${opts.allowed.map((m) => IMAGE_TYPES[m]!.slice(1).toUpperCase()).join(", ")}.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const trusted = verifyUpload(bytes, mime);
  if (!trusted || !opts.allowed.includes(trusted)) return fail(415, "That file doesn't match its type.");
  return { bytes, mime: trusted, form: form!, name: file.name };
}

export const isResponse = (v: unknown): v is Response => v instanceof Response;
