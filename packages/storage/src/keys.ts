import { randomBytes } from "node:crypto";

const SEGMENT = /^[A-Za-z0-9_-]+$/;
const EXT = /^[a-z0-9]{1,8}$/;

/** `p/<profileId>/<kind>/<128-bit base64url>.<ext>`: unguessable, scoped by profile, never containing user text. */
export function objectKey(profileId: string, kind: string, ext: string): string {
  if (!SEGMENT.test(profileId)) throw new Error("Invalid profile id for a storage key");
  if (!SEGMENT.test(kind)) throw new Error("Invalid kind for a storage key");
  if (!EXT.test(ext)) throw new Error("Invalid extension for a storage key");
  return `p/${profileId}/${kind}/${randomBytes(16).toString("base64url")}.${ext}`;
}

const KEY_SEGMENT = /^[A-Za-z0-9_-]+(\.[a-z0-9]+)?$/;

/** A key is 1..6 safe path segments; only the last may carry one lowercase extension. Anything else is refused. */
export function isValidKey(key: string): boolean {
  if (!key || key.length > 300) return false;
  const parts = key.split("/");
  if (parts.length > 6) return false;
  return parts.every((p, i) => (i === parts.length - 1 ? KEY_SEGMENT.test(p) : SEGMENT.test(p)));
}

export function assertValidKey(key: string): void {
  if (!isValidKey(key)) throw new Error("Invalid file key");
}

export const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
