import { randomUUID } from "node:crypto";
import { createLocalStore, type BlobStore } from "@brandloop/storage";
import { DOCUMENT_TYPES, IMAGE_TYPES } from "./limits";

const FLAT_KEY = /^[A-Za-z0-9-]+(\.[a-z0-9]+)?$/;

export type UploadStore = {
  put(buf: Buffer, mime: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};

/**
 * Knowledge uploads are private: this wraps a private BlobStore and keeps the old `UploadStore` shape. Keys stay flat
 * (`<uuid>.<ext>`) under the same root as before, so files stored earlier remain readable.
 */
export function uploadStoreFrom(blobs: BlobStore): UploadStore {
  const flat = (key: string) => {
    if (!FLAT_KEY.test(key)) throw new Error("Invalid file key");
    return key;
  };
  return {
    async put(buf, mime) {
      const key = `${randomUUID()}${DOCUMENT_TYPES[mime] ?? IMAGE_TYPES[mime] ?? ""}`;
      await blobs.put(key, buf, { contentType: mime, visibility: "private" });
      return key;
    },
    async get(key) {
      const found = await blobs.get(flat(key));
      if (!found) throw new Error("File not found");
      return found.bytes;
    },
    async delete(key) {
      await blobs.delete(flat(key));
    },
  };
}

export function localUploadStore(root = ".data/uploads"): UploadStore {
  return uploadStoreFrom(createLocalStore({ root }));
}
