import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { localUploadStore } from "./upload-store";

let root: string | undefined;
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("localUploadStore", () => {
  it("puts, gets and deletes a file by key", async () => {
    root = await mkdtemp(join(tmpdir(), "uploads-"));
    const store = localUploadStore(root);
    const key = await store.put(Buffer.from("hello"), "text/plain");
    expect(key).toMatch(/\.txt$/);
    expect((await store.get(key)).toString()).toBe("hello");
    await store.delete(key);
    await expect(store.get(key)).rejects.toThrow();
    await store.delete(key); // deleting twice is fine
  });

  it("rejects keys that escape the root", async () => {
    root ??= await mkdtemp(join(tmpdir(), "uploads-"));
    const store = localUploadStore(root);
    await expect(store.get("../../etc/passwd")).rejects.toThrow(/Invalid file key/);
    await expect(store.delete("a/b")).rejects.toThrow(/Invalid file key/);
  });
});
