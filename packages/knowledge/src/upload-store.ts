import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DOCUMENT_TYPES, IMAGE_TYPES } from "./limits";

export type UploadStore = {
  put(buf: Buffer, mime: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};

const KEY = /^[A-Za-z0-9-]+(\.[a-z0-9]+)?$/;

export function localUploadStore(root = ".data/uploads"): UploadStore {
  // `turbopackIgnore` on each runtime path: a dynamic root makes Turbopack trace (and bundle) the whole project.
  const base = resolve(/* turbopackIgnore: true */ root);
  const pathFor = (key: string) => {
    if (!KEY.test(key)) throw new Error("Invalid file key");
    return join(/* turbopackIgnore: true */ base, key);
  };
  return {
    async put(buf, mime) {
      const key = `${randomUUID()}${DOCUMENT_TYPES[mime] ?? IMAGE_TYPES[mime] ?? ""}`;
      await mkdir(/* turbopackIgnore: true */ base, { recursive: true });
      await writeFile(/* turbopackIgnore: true */ pathFor(key), buf);
      return key;
    },
    async get(key) {
      return readFile(/* turbopackIgnore: true */ pathFor(key));
    },
    async delete(key) {
      await rm(/* turbopackIgnore: true */ pathFor(key), { force: true });
    },
  };
}
