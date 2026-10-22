import { createHash } from "node:crypto";
import { getObject, recordObject, type StorageKind, type StorageObject } from "@brandloop/db";
import { createBlobStores, EXTENSIONS, imageSize, KIND_VISIBILITY, objectKey, type BlobStores } from "@brandloop/storage";

let stores: BlobStores | undefined;

/** The process-wide blob stores, built from env on first use. */
export function getStores(): BlobStores {
  return (stores ??= createBlobStores());
}

/** Tests only: drops the cached stores (and optionally installs fakes) so the next call re-reads env. */
export function resetStoresForTest(replacement?: BlobStores): void {
  stores = replacement;
}

const storeFor = (kind: StorageKind) => (KIND_VISIBILITY[kind] === "public" ? getStores().public : getStores().private);

export type StoredFile = { id: string; url: string | null };

/**
 * Puts the bytes in the store that matches the kind (private kinds never touch the public store), then records the row.
 * If recording fails the blob is deleted again, so a database error leaves no orphan.
 */
export async function storeFile(
  profileId: string,
  teamId: string,
  kind: StorageKind,
  bytes: Buffer,
  contentType: string,
): Promise<StoredFile> {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error(`Unsupported content type for storage: ${contentType}`);
  const visibility = KIND_VISIBILITY[kind];
  const store = storeFor(kind);
  const key = objectKey(profileId, kind.toLowerCase(), ext);
  const size = contentType.startsWith("image/") ? await imageSize(bytes) : null;
  const put = await store.put(key, bytes, {
    contentType,
    visibility,
    cacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : undefined,
  });
  try {
    const row = await recordObject({
      profileId,
      teamId,
      key,
      store: visibility === "public" ? "PUBLIC" : "PRIVATE",
      kind,
      contentType,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: size?.width ?? null,
      height: size?.height ?? null,
      url: put.url,
    });
    return { id: row.id, url: row.url };
  } catch (err) {
    await store.delete(key).catch(() => undefined);
    throw err;
  }
}

/** The bytes of one of this profile's live objects, or null. */
export async function readFile(
  profileId: string,
  id: string,
): Promise<{ object: StorageObject; bytes: Buffer; contentType: string } | null> {
  const object = await getObject(profileId, id);
  if (!object) return null;
  const found = await (object.store === "PUBLIC" ? getStores().public : getStores().private).get(object.key);
  return found ? { object, bytes: found.bytes, contentType: object.contentType } : null;
}
