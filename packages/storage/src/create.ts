import { createLocalStore } from "./local";
import type { BlobStore, Visibility } from "./types";
import { createUpstashStore, sdkBucket, type UpstashBucketLike } from "./upstash";

export type StorageEnv = Partial<
  Record<"STORAGE_DRIVER" | "STORAGE_LOCAL_ROOT" | "UPSTASH_BLOB_TOKEN" | "UPSTASH_BLOB_PUBLIC_BASE" | "NODE_ENV", string | undefined>
>;
export type BlobStores = { public: BlobStore; private: BlobStore; driver: "upstash" | "local" };

/** A store that only accepts one visibility, so a private file can never reach the public store (or the reverse). */
function only(store: BlobStore, visibility: Visibility): BlobStore {
  return {
    ...store,
    put(key, bytes, opts) {
      if (opts.visibility !== visibility) return Promise.reject(new Error(`Refusing a ${opts.visibility} file: this store only accepts ${visibility} files`));
      return store.put(key, bytes, opts);
    },
  };
}

/**
 * - `public`: the hosted Upstash bucket in production when a token is set (or when STORAGE_DRIVER=upstash), else disk.
 * - `private`: always disk until a private bucket exists.
 */
export function createBlobStores(env: StorageEnv = process.env, deps: { bucket?: UpstashBucketLike } = {}): BlobStores {
  const token = env.UPSTASH_BLOB_TOKEN?.trim();
  const requested = env.STORAGE_DRIVER?.trim();
  if (requested && requested !== "upstash" && requested !== "local") throw new Error(`Unknown STORAGE_DRIVER "${requested}"`);
  const driver = (requested ?? (env.NODE_ENV === "production" && token ? "upstash" : "local")) as "upstash" | "local";
  const root = env.STORAGE_LOCAL_ROOT?.trim() || ".data/blob";

  const priv = only(createLocalStore({ root: `${root}/private` }), "private");
  if (driver === "upstash") {
    if (!token && !deps.bucket) throw new Error("STORAGE_DRIVER=upstash needs UPSTASH_BLOB_TOKEN");
    const bucket = deps.bucket ?? sdkBucket(token!);
    return { driver, public: only(createUpstashStore(bucket, { publicBase: env.UPSTASH_BLOB_PUBLIC_BASE }), "public"), private: priv };
  }
  return { driver, public: only(createLocalStore({ root: `${root}/public`, publicBase: "/api/files/public" }), "public"), private: priv };
}
