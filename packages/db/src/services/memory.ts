import { prisma } from "../client";
import type { MemoryDoc, MemorySource } from "../generated/prisma/client";
import { AccountError } from "./account";
import { replaceOnce } from "./memory-tree";

export const MEMORY_KEYS = {
  about: "identity/about",
  story: "identity/story",
  personal: "identity/personal",
  rules: "writing/rules",
  voice: "voice/style",
} as const;

const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const BULLET = /^(\s*)([-*+]\s+)(.*)$/;

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new AccountError(`Invalid memory key: ${key}`);
}

const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function listMemory(profileId: string): Promise<MemoryDoc[]> {
  return prisma.memoryDoc.findMany({ where: { profileId }, orderBy: { key: "asc" } });
}

/** Thrown when a write carries an `expectedVersion` that no longer matches the store. */
export class MemoryVersionConflict extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("Memory changed since you loaded it.");
    this.name = "MemoryVersionConflict";
    this.currentVersion = currentVersion;
  }
}

/** The profile's store-wide memory version. It goes up by one on every memory write. */
export async function getMemoryVersion(profileId: string): Promise<number> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { memoryVersion: true } });
  if (!profile) throw new AccountError("Profile not found");
  return profile.memoryVersion;
}

/**
 * The single write path for memory. Bumps the profile's memory version and upserts (or, with `null`
 * content, deletes) the section in one transaction. The version bump takes the profile row lock first,
 * so concurrent writers to the same profile are serialised. With `expectedVersion`, the bump only
 * succeeds if the version still matches, otherwise nothing is written and `MemoryVersionConflict` is thrown.
 */
export async function writeSection(
  profileId: string,
  key: string,
  content: string | null,
  source: MemorySource,
  opts: { expectedVersion?: number } = {},
): Promise<{ doc: MemoryDoc | null; version: number }> {
  assertKey(key);
  const expected = opts.expectedVersion;
  return prisma.$transaction(async (tx) => {
    const bumped = await tx.profile.updateMany({
      where: { id: profileId, ...(expected !== undefined && { memoryVersion: expected }) },
      data: { memoryVersion: { increment: 1 } },
    });
    if (bumped.count === 0) {
      const profile = await tx.profile.findUnique({ where: { id: profileId }, select: { memoryVersion: true } });
      if (!profile) throw new AccountError("Profile not found");
      throw new MemoryVersionConflict(profile.memoryVersion);
    }
    // The row lock from the bump above is held until commit, so this read is the version we just wrote.
    const { memoryVersion } = await tx.profile.findUniqueOrThrow({
      where: { id: profileId },
      select: { memoryVersion: true },
    });
    if (content === null) {
      await tx.memoryDoc.deleteMany({ where: { profileId, key } });
      return { doc: null, version: memoryVersion };
    }
    const doc = await tx.memoryDoc.upsert({
      where: { profileId_key: { profileId, key } },
      create: { profileId, key, content, source },
      update: { content, source },
    });
    return { doc, version: memoryVersion };
  });
}

/**
 * Read-modify-write with optimistic concurrency. `fn` receives the version read just before it runs;
 * it should read what it needs, compute, and pass that version as `expectedVersion` to `writeSection`.
 * On `MemoryVersionConflict` the whole function re-runs against fresh data, up to `attempts` times.
 */
export async function withMemoryRetry<T>(
  profileId: string,
  fn: (version: number) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const version = await getMemoryVersion(profileId);
    try {
      return await fn(version);
    } catch (err) {
      if (!(err instanceof MemoryVersionConflict) || attempt >= attempts) throw err;
    }
  }
}

export async function upsertMemory(
  profileId: string,
  key: string,
  content: string,
  source: MemorySource,
): Promise<MemoryDoc> {
  const { doc } = await writeSection(profileId, key, content, source);
  return doc!;
}

/** Bullet lines only. `index` is the raw line index; `depth` is indent in two-space steps. */
export function memoryLines(content: string): { index: number; text: string; depth: number }[] {
  const out: { index: number; text: string; depth: number }[] = [];
  content.split("\n").forEach((line, index) => {
    const m = BULLET.exec(line);
    if (m) out.push({ index, text: m[3]!.trim(), depth: Math.floor(m[1]!.replace(/\t/g, "  ").length / 2) });
  });
  return out;
}

async function currentContent(profileId: string, key: string) {
  const doc = await prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId, key } } });
  return doc;
}

export async function appendMemoryLines(
  profileId: string,
  key: string,
  lines: string[],
  source: MemorySource,
): Promise<MemoryDoc> {
  assertKey(key);
  return withMemoryRetry(profileId, async (version) => {
    const existing = await currentContent(profileId, key);
    const content = existing?.content ?? "";
    const seen = new Set(memoryLines(content).map((l) => normalise(l.text)));
    const added: string[] = [];
    for (const raw of lines) {
      const text = raw.trim();
      const norm = normalise(text);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      added.push(`- ${text}`);
    }
    if (added.length === 0 && existing) return existing;
    const next = [content.trimEnd(), ...added].filter((s) => s.length > 0).join("\n");
    const { doc } = await writeSection(profileId, key, next, existing?.source ?? source, {
      expectedVersion: version,
    });
    return doc!;
  });
}

function bulletLines(doc: MemoryDoc, lineIndex: number, expectedText: string) {
  const lines = doc.content.split("\n");
  const bullet = Number.isInteger(lineIndex) && lines[lineIndex] ? BULLET.exec(lines[lineIndex]!) : null;
  if (!bullet) throw new AccountError("Not an editable line");
  if (bullet[3]!.trim() !== expectedText.trim()) {
    throw new AccountError("This memory changed. Refresh and try again.");
  }
  return { lines, indent: bullet[1]!, marker: bullet[2]! };
}

/** Change one bullet line of a section, keeping its source. Retries if the store moved underneath it. */
function changeBulletLine(
  profileId: string,
  key: string,
  lineIndex: number,
  expectedText: string,
  change: (lines: string[], bullet: { indent: string; marker: string }) => void,
): Promise<MemoryDoc> {
  return withMemoryRetry(profileId, async (version) => {
    const doc = await currentContent(profileId, key);
    if (!doc) throw new AccountError("Memory document not found");
    const { lines, indent, marker } = bulletLines(doc, lineIndex, expectedText);
    change(lines, { indent, marker });
    const written = await writeSection(profileId, key, lines.join("\n"), doc.source, { expectedVersion: version });
    return written.doc!;
  });
}

export function editMemoryLine(
  profileId: string,
  key: string,
  lineIndex: number,
  text: string,
  /** Required: the retry loop re-reads the section, and this stops a retry landing on a different line. */
  expectedText: string,
): Promise<MemoryDoc> {
  const clean = text.trim();
  if (!clean) return Promise.reject(new AccountError("Line text is required"));
  return changeBulletLine(profileId, key, lineIndex, expectedText, (lines, bullet) => {
    lines[lineIndex] = `${bullet.indent}${bullet.marker}${clean}`;
  });
}

export function deleteMemoryLine(
  profileId: string,
  key: string,
  lineIndex: number,
  /** Required: the retry loop re-reads the section, and this stops a retry landing on a different line. */
  expectedText: string,
): Promise<MemoryDoc> {
  return changeBulletLine(profileId, key, lineIndex, expectedText, (lines) => {
    lines.splice(lineIndex, 1);
  });
}

/**
 * Replace one exact occurrence of `find` inside a section (the agent's `editMemory`). Nothing is written
 * unless `find` appears exactly once. `replace: ""` deletes the matched text.
 */
export async function replaceInSection(
  profileId: string,
  key: string,
  find: string,
  replace: string,
  source: MemorySource,
): Promise<
  { ok: true; version: number } | { ok: false; reason: "missing_section" | "not_found" | "ambiguous"; count: number }
> {
  assertKey(key);
  return withMemoryRetry(profileId, async (version) => {
    const doc = await currentContent(profileId, key);
    if (!doc) return { ok: false, reason: "missing_section", count: 0 } as const;
    const result = replaceOnce(doc.content, find, replace);
    if (!result.ok) {
      return { ok: false, reason: result.count === 0 ? "not_found" : "ambiguous", count: result.count } as const;
    }
    const written = await writeSection(profileId, key, result.content, source, { expectedVersion: version });
    return { ok: true, version: written.version } as const;
  });
}
