import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertValidKey } from "./keys";
import type { BlobStore } from "./types";

export type LocalOptions = {
  root: string;
  /** Set for the public store: puts return `${publicBase}/${key}`, served by the dev-only public route. */
  publicBase?: string;
};

/**
 * Disk adapter. Each object is `<root>/<key>` plus a `<key>.meta` sidecar holding the content type (a key's last
 * segment allows only one dot, so a sidecar can never collide with a real key).
 */
export function createLocalStore({ root, publicBase }: LocalOptions): BlobStore {
  // `turbopackIgnore` on each runtime path: a dynamic root makes Turbopack trace (and bundle) the whole project.
  const base = resolve(/* turbopackIgnore: true */ root);
  const pathFor = (key: string) => {
    assertValidKey(key);
    return join(/* turbopackIgnore: true */ base, key);
  };
  const publicUrl = (key: string) => {
    assertValidKey(key);
    return publicBase ? `${publicBase}/${key}` : null;
  };
  return {
    async put(key, bytes, opts) {
      const file = pathFor(key);
      await mkdir(/* turbopackIgnore: true */ dirname(file), { recursive: true });
      await writeFile(/* turbopackIgnore: true */ file, bytes);
      await writeFile(/* turbopackIgnore: true */ `${file}.meta`, opts.contentType);
      return { key, url: opts.visibility === "public" ? publicUrl(key) : null };
    },
    async get(key) {
      const file = pathFor(key);
      try {
        const [bytes, contentType] = await Promise.all([
          readFile(/* turbopackIgnore: true */ file),
          readFile(/* turbopackIgnore: true */ `${file}.meta`, "utf8").catch(() => "application/octet-stream"),
        ]);
        return { bytes, contentType };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async delete(key) {
      const file = pathFor(key);
      await rm(/* turbopackIgnore: true */ file, { force: true });
      await rm(/* turbopackIgnore: true */ `${file}.meta`, { force: true });
    },
    publicUrl,
  };
}
