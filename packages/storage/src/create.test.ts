import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBlobStores } from "./create";
import type { UpstashBucketLike } from "./upstash";

function fakeBucket() {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const bucket: UpstashBucketLike = {
    put: vi.fn(async (path, bytes, o) => {
      objects.set(path, { bytes, contentType: o.contentType });
      return { path, url: `https://blob.example/orbit/${path}` };
    }),
    get: vi.fn(async (path) => objects.get(path) ?? null),
    del: vi.fn(async (path) => void objects.delete(path)),
  };
  return { bucket, objects };
}
const buf = Buffer.from("x");

describe("createBlobStores", () => {
  it("refuses a private put on the upstash adapter", async () => {
    const { bucket } = fakeBucket();
    const { public: pub } = createBlobStores({ STORAGE_DRIVER: "upstash", UPSTASH_BLOB_TOKEN: "t", NODE_ENV: "production" }, { bucket });
    await expect(pub.put("p/x/knowledge/a.pdf", buf, { contentType: "application/pdf", visibility: "private" })).rejects.toThrow(/private/);
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it("the private store is local even when the hosted adapter is active, and refuses public puts", async () => {
    const root = await mkdtemp(join(tmpdir(), "blob-create-"));
    try {
      const { bucket } = fakeBucket();
      const stores = createBlobStores(
        { STORAGE_DRIVER: "upstash", UPSTASH_BLOB_TOKEN: "t", NODE_ENV: "production", STORAGE_LOCAL_ROOT: root },
        { bucket },
      );
      const r = await stores.private.put("p/ck1/reference/aaaaaaaaaaaaaaaaaaaaaa.png", buf, { contentType: "image/png", visibility: "private" });
      expect(r.url).toBeNull();
      expect(bucket.put).not.toHaveBeenCalled();
      await expect(stores.private.put("p/ck1/visual/a.png", buf, { contentType: "image/png", visibility: "public" })).rejects.toThrow(/public/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("round-trips through the hosted adapter and returns the bucket URL", async () => {
    const { bucket } = fakeBucket();
    const { public: pub } = createBlobStores({ STORAGE_DRIVER: "upstash", UPSTASH_BLOB_TOKEN: "t" }, { bucket });
    const key = "p/ck1/visual/aaaaaaaaaaaaaaaaaaaaaa.png";
    const put = await pub.put(key, buf, { contentType: "image/png", visibility: "public", cacheControl: "public, max-age=31536000, immutable" });
    expect(put.url).toBe(`https://blob.example/orbit/${key}`);
    expect((await pub.get(key))?.contentType).toBe("image/png");
    await pub.delete(key);
    expect(await pub.get(key)).toBeNull();
  });

  it("defaults to local outside production even with a token", async () => {
    const root = await mkdtemp(join(tmpdir(), "blob-create-"));
    try {
      const { bucket } = fakeBucket();
      const { public: pub } = createBlobStores({ UPSTASH_BLOB_TOKEN: "t", NODE_ENV: "development", STORAGE_LOCAL_ROOT: root }, { bucket });
      const r = await pub.put("p/ck1/visual/aaaaaaaaaaaaaaaaaaaaaa.png", buf, { contentType: "image/png", visibility: "public" });
      expect(r.url).toBe("/api/files/public/p/ck1/visual/aaaaaaaaaaaaaaaaaaaaaa.png");
      expect(bucket.put).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the hosted adapter in production when a token is set, local without one", () => {
    const { bucket } = fakeBucket();
    const hosted = createBlobStores({ NODE_ENV: "production", UPSTASH_BLOB_TOKEN: "t" }, { bucket });
    expect(hosted.driver).toBe("upstash");
    expect(createBlobStores({ NODE_ENV: "production" }).driver).toBe("local");
  });

  it("throws when the hosted driver is requested without a token", () => {
    expect(() => createBlobStores({ STORAGE_DRIVER: "upstash" })).toThrow(/UPSTASH_BLOB_TOKEN/);
  });
});
