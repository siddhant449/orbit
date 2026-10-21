import { DOCUMENT_TYPES, IMAGE_TYPES } from "./limits";

const startsWith = (buf: Buffer, bytes: number[], at = 0) => bytes.every((b, i) => buf[at + i] === b);

function sniffImage(buf: Buffer): string | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (buf.subarray(0, 6).toString("latin1") === "GIF87a" || buf.subarray(0, 6).toString("latin1") === "GIF89a") return "image/gif";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/**
 * Checks the file's leading bytes against its declared type. Returns the MIME type to trust
 * (for images, the sniffed one), or null on a mismatch.
 */
export function verifyUpload(buf: Buffer, declared: string): string | null {
  if (declared in IMAGE_TYPES) return sniffImage(buf);
  if (!(declared in DOCUMENT_TYPES)) return null;
  switch (declared) {
    case "application/pdf":
      return buf.subarray(0, 5).toString("latin1") === "%PDF-" ? declared : null;
    case "text/plain":
    case "text/markdown":
      return buf.subarray(0, 8192).includes(0) ? null : declared;
    default: // docx, xlsx: zip container
      return startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) ? declared : null;
  }
}
