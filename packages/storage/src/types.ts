export type Visibility = "public" | "private";

export type PutOpts = { contentType: string; visibility: Visibility; cacheControl?: string };

/** `url` is set only for public puts. */
export type PutResult = { key: string; url: string | null };

export type BlobStore = {
  put(key: string, bytes: Buffer, opts: PutOpts): Promise<PutResult>;
  /** `null` when the key does not exist. */
  get(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
  /** A URL for a public key when this store can derive one without a request, else null. */
  publicUrl(key: string): string | null;
};

/** What a stored file is for. Mirrors the db `StorageKind` enum. */
export const STORAGE_KINDS = ["KNOWLEDGE", "VISUAL", "REFERENCE", "LOGO", "POST_MEDIA", "CAROUSEL_PDF"] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

/**
 * Generated visuals, logos, post media and carousel PDFs are destined for LinkedIn, so they live in the public store
 * (unguessable keys). Knowledge uploads and reference images are the user's private material and never leave the
 * private store.
 */
export const KIND_VISIBILITY: Record<StorageKind, Visibility> = {
  KNOWLEDGE: "private",
  REFERENCE: "private",
  VISUAL: "public",
  LOGO: "public",
  POST_MEDIA: "public",
  CAROUSEL_PDF: "public",
};
