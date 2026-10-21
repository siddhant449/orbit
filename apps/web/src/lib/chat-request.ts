import type { ChatRequestBody } from "@brandloop/agent";

/**
 * Request-level guards for POST /api/chat (ruling A9): a byte cap on the body that holds even without a
 * content-length, and an origin check on attachment URLs.
 */

/** 200,000 chars of text (up to ~800 KB as UTF-8 and JSON escapes) plus ~1 MB of slack for the rest of the body. */
export const MAX_CHAT_BODY_BYTES = 1_250_000;

/** Where chat attachments are served from on our own origin. */
export const UPLOAD_PATH_PREFIX = "/api/files/";

export type CappedJson = { ok: true; value: unknown } | { ok: false; tooLarge: boolean };

/** Reads a JSON body, refusing anything over `max` bytes: by content-length first, then while streaming. */
export async function readCappedJson(request: Request, max = MAX_CHAT_BODY_BYTES): Promise<CappedJson> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return { ok: false, tooLarge: true };
  if (!request.body) return { ok: false, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

/** Origins allowed for attachments besides our own: `BLOB_PUBLIC_ORIGIN`, comma-separated. */
function allowedOrigins(env: Record<string, string | undefined>): Set<string> {
  const out = new Set<string>();
  for (const raw of (env.BLOB_PUBLIC_ORIGIN ?? "").split(",")) {
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") out.add(u.origin);
    } catch {
      /* skip junk entries */
    }
  }
  return out;
}

/**
 * The app's own public origin, from `APP_URL`. Never derived from the request: its Host header is client
 * controlled. Unset in production means "no trusted origin" (null); in dev it defaults to localhost:3000.
 */
export function appOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.APP_URL?.trim();
  if (!raw) return env.NODE_ENV === "production" ? null : "http://localhost:3000";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Accepts only our own upload paths on the configured app origin (relative paths are resolved against it)
 * and http(s) URLs on an allowlisted blob origin. Returns the body with absolute URLs, or null when any
 * attachment is refused. With no trusted app origin, own-origin paths are refused.
 */
export function checkAttachments(
  body: ChatRequestBody,
  env: Record<string, string | undefined> = process.env,
): ChatRequestBody | null {
  const files = body.message.parts.filter((p) => p.type === "file");
  if (files.length === 0) return body;
  const app = appOrigin(env);
  const allowed = allowedOrigins(env);
  const parts: ChatRequestBody["message"]["parts"] = [];
  for (const part of body.message.parts) {
    if (part.type !== "file") {
      parts.push(part);
      continue;
    }
    let url: URL;
    try {
      // Without a trusted origin, a relative path can't resolve (the base is a dead placeholder).
      url = new URL(part.url, app ?? "invalid:");
    } catch {
      return null;
    }
    const own = app !== null && url.origin === app && url.pathname.startsWith(UPLOAD_PATH_PREFIX);
    const blob = allowed.has(url.origin) && (url.protocol === "https:" || url.protocol === "http:");
    if (!own && !blob) return null;
    parts.push({ ...part, url: url.href });
  }
  return { ...body, message: { ...body.message, parts } };
}
