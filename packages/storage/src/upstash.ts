// The only file that touches the hosted SDK (@upstash/blob). The bucket `orbit` is PUBLIC: everything written here is
// readable by anyone with the URL, so the adapter refuses private puts outright.
import { Bucket, BlobError } from "@upstash/blob";
import type { BlobStore } from "./types";

/** The slice of the SDK the adapter needs; tests inject a fake. */
export type UpstashBucketLike = {
  put(path: string, bytes: Buffer, opts: { contentType: string; cache?: "immutable" | "no-store" }): Promise<{ path: string; url?: string }>;
  get(path: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  del(path: string): Promise<void>;
};

export function sdkBucket(token: string): UpstashBucketLike {
  const bucket = new Bucket({ token, enableTelemetry: false });
  return {
    async put(path, bytes, opts) {
      const done = await bucket.put(path, bytes, { contentType: opts.contentType, cache: opts.cache, allowOverwrite: false });
      return { path: done.path, url: done.url };
    },
    async get(path) {
      try {
        const res = await bucket.get(path);
        return { bytes: Buffer.from(await new Response(res.body).arrayBuffer()), contentType: res.contentType };
      } catch (err) {
        if (err instanceof BlobError && err.code === "not_found") return null;
        throw err;
      }
    },
    async del(path) {
      await bucket.del(path);
    },
  };
}

export function createUpstashStore(bucket: UpstashBucketLike, opts: { publicBase?: string } = {}): BlobStore {
  return {
    async put(key, bytes, o) {
      if (o.visibility !== "public") throw new Error("The hosted bucket is public: refusing to store a private file in it");
      const cache = o.cacheControl?.includes("immutable") ? "immutable" : o.cacheControl?.includes("no-store") ? "no-store" : undefined;
      const res = await bucket.put(key, bytes, { contentType: o.contentType, cache });
      if (!res.url) throw new Error("The hosted bucket returned no public URL");
      return { key, url: res.url };
    },
    get: (key) => bucket.get(key),
    async delete(key) {
      await bucket.del(key);
    },
    publicUrl: (key) => (opts.publicBase ? `${opts.publicBase.replace(/\/$/, "")}/${key}` : null),
  };
}
