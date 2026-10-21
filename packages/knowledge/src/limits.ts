export const KNOWLEDGE_LIMITS = {
  title: 100,
  text: 50_000,
  minWords: 100,
  documentBytes: 20 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  pageSize: 50,
} as const;

/** MIME type to canonical extension. */
export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Browsers often send "" or application/octet-stream for .md; fall back to the filename. */
export function resolveUploadMime(filename: string, declared: string): string | null {
  const known = (m: string) => m in DOCUMENT_TYPES || m in IMAGE_TYPES;
  const mime = declared.split(";")[0]!.trim().toLowerCase();
  if (known(mime) && mime !== "text/plain") return mime;
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  const byExt = ext ? BY_EXTENSION[ext] : undefined;
  if (byExt && (known(mime) || !mime || mime === "application/octet-stream")) return byExt;
  return known(mime) ? mime : null;
}
