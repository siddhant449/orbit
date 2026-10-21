import {
  AccountError,
  MemoryVersionConflict,
  getMemoryVersion,
  keyToPath,
  listMemory,
  pathToKey,
  sectionMeta,
  writeSection,
} from "@brandloop/db";

export const MAX_CONTENT_CHARS = 20_000;

export type HandlerResult = { status: number; body: Record<string, unknown> };

/** The whole memory store: one version for every section, plus each section with its title and description. */
export async function readUserMemory(profileId: string): Promise<HandlerResult> {
  // Version first: if a write lands between the two reads, the sections are newer than the version,
  // so the client's next PATCH is rejected (409) instead of silently overwriting.
  const version = await getMemoryVersion(profileId);
  const docs = await listMemory(profileId);
  return {
    status: 200,
    body: {
      version,
      sections: docs.map((doc) => ({
        key: doc.key,
        path: keyToPath(doc.key),
        ...sectionMeta(doc.key),
        content: doc.content,
        source: doc.source,
        pinned: doc.pinned,
        updatedAt: doc.updatedAt,
      })),
    },
  };
}

const bad = (error: string): HandlerResult => ({ status: 400, body: { error } });

/**
 * Replace one whole section. `content: null` (exactly null) deletes it; a string must have real text, so a
 * blank or whitespace-only string is a 400 rather than a silent delete. Rejected with 409 if the store
 * changed since `expectedVersion`.
 */
export async function patchUserMemory(profileId: string, body: unknown): Promise<HandlerResult> {
  const input = (body && typeof body === "object" ? body : {}) as {
    target?: unknown;
    content?: unknown;
    expectedVersion?: unknown;
  };

  const key = typeof input.target === "string" ? pathToKey(input.target) : null;
  if (!key) return bad("Unknown memory section");

  const { content, expectedVersion } = input;
  if (content !== null) {
    if (typeof content !== "string") return bad("content must be a string, or null to delete");
    if (content.trim() === "") return bad("content can't be blank. Send null to delete the section.");
    if (content.length > MAX_CONTENT_CHARS) {
      return bad(`That's too long. Keep it under ${MAX_CONTENT_CHARS.toLocaleString("en-US")} characters.`);
    }
  }
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return bad("expectedVersion must be a whole number");
  }

  try {
    const { version } = await writeSection(profileId, key, content as string | null, "USER", { expectedVersion });
    return { status: 200, body: { success: true, version } };
  } catch (err) {
    if (err instanceof MemoryVersionConflict) {
      return {
        status: 409,
        body: { code: "memory_version_conflict", error: err.message, version: err.currentVersion },
      };
    }
    if (err instanceof AccountError) return bad(err.message);
    throw err;
  }
}
