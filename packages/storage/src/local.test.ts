import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalStore } from "./local";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "blob-"));
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("local store", () => {
  it("round-trips bytes and content type, deletes idempotently, and refuses keys outside the root", async () => {
    const store = createLocalStore({ root, publicBase: "/api/files/public" });
    const key = "p/ck1/visual/abcdefghijklmnopqrstuv.png";
    await store.put(key, Buffer.from("png-bytes"), { contentType: "image/png", visibility: "public" });
    const got = await store.get(key);
    expect(got?.bytes.toString()).toBe("png-bytes");
    expect(got?.contentType).toBe("image/png");
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
    await store.delete(key); // second delete is fine
    for (const bad of ["../x", "p/../../etc/passwd", "/abs.png", "p//x.png", "a/b\\c.png", ""]) {
      await expect(store.get(bad)).rejects.toThrow(/Invalid file key/);
      await expect(store.put(bad, Buffer.from("x"), { contentType: "image/png", visibility: "public" })).rejects.toThrow(/Invalid file key/);
    }
    // nothing leaked beside the root
    expect((await readdir(root)).every((n) => n === "p")).toBe(true);
  });

  it("returns a /api/files/public URL only for public puts", async () => {
    const store = createLocalStore({ root, publicBase: "/api/files/public" });
    const pub = await store.put("p/ck1/visual/pubpubpubpubpubpubpubpu.png", Buffer.from("x"), { contentType: "image/png", visibility: "public" });
    expect(pub.url).toBe("/api/files/public/p/ck1/visual/pubpubpubpubpubpubpubpu.png");
    const priv = await store.put("p/ck1/reference/prvprvprvprvprvprvprvp.png", Buffer.from("x"), { contentType: "image/png", visibility: "private" });
    expect(priv.url).toBeNull();
    expect(store.publicUrl("p/ck1/visual/a.png")).toBe("/api/files/public/p/ck1/visual/a.png");
  });

  it("serves a private store without public URLs", async () => {
    const store = createLocalStore({ root });
    expect(store.publicUrl("p/ck1/x/a.png")).toBeNull();
    const r = await store.put("uuid-1.pdf", Buffer.from("%PDF-"), { contentType: "application/pdf", visibility: "private" });
    expect(r.url).toBeNull();
    expect((await store.get("uuid-1.pdf"))?.contentType).toBe("application/pdf");
  });
});
