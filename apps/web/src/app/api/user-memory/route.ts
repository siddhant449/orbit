import { NextResponse } from "next/server";
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
import { getAccount } from "@/lib/account";

const MAX_CONTENT_CHARS = 20_000;

/** The whole memory store: one version for every section, plus each section with its title and description. */
export async function GET() {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  // Version first: if a write lands between the two reads, the sections are newer than the version,
  // so the client's next PATCH is rejected (409) instead of silently overwriting.
  const version = await getMemoryVersion(currentProfile.id);
  const docs = await listMemory(currentProfile.id);
  return NextResponse.json({
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
  });
}

/** Replace one whole section. `content: ""` deletes it. Rejected with 409 if the store changed since `expectedVersion`. */
export async function PATCH(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as {
    target?: unknown;
    content?: unknown;
    expectedVersion?: unknown;
  } | null;

  const key = typeof body?.target === "string" ? pathToKey(body.target) : null;
  if (!key) return NextResponse.json({ error: "Unknown memory section" }, { status: 400 });
  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  if (body.content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `That's too long. Keep it under ${MAX_CONTENT_CHARS.toLocaleString("en-US")} characters.` },
      { status: 400 },
    );
  }
  const expectedVersion = body.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return NextResponse.json({ error: "expectedVersion must be a whole number" }, { status: 400 });
  }

  try {
    const { version } = await writeSection(
      currentProfile.id,
      key,
      body.content.trim() === "" ? null : body.content,
      "USER",
      { expectedVersion },
    );
    return NextResponse.json({ success: true, version });
  } catch (err) {
    if (err instanceof MemoryVersionConflict) {
      return NextResponse.json(
        { code: "memory_version_conflict", error: err.message, version: err.currentVersion },
        { status: 409 },
      );
    }
    if (err instanceof AccountError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
