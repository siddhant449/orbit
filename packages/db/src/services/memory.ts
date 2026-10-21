import { prisma } from "../client";
import type { MemoryDoc, MemorySource } from "../generated/prisma/client";
import { AccountError } from "./account";

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

export async function upsertMemory(
  profileId: string,
  key: string,
  content: string,
  source: MemorySource,
): Promise<MemoryDoc> {
  assertKey(key);
  return prisma.memoryDoc.upsert({
    where: { profileId_key: { profileId, key } },
    create: { profileId, key, content, source },
    update: { content, source },
  });
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
  return upsertMemory(profileId, key, next, existing?.source ?? source);
}

async function bulletLines(profileId: string, key: string, lineIndex: number, expectedText?: string) {
  const doc = await currentContent(profileId, key);
  if (!doc) throw new AccountError("Memory document not found");
  const lines = doc.content.split("\n");
  if (!Number.isInteger(lineIndex) || !lines[lineIndex] || !BULLET.test(lines[lineIndex]!)) {
    throw new AccountError("Not an editable line");
  }
  if (expectedText !== undefined && BULLET.exec(lines[lineIndex]!)![3]!.trim() !== expectedText.trim()) {
    throw new AccountError("This memory changed. Refresh and try again.");
  }
  return { doc, lines };
}

export async function editMemoryLine(
  profileId: string,
  key: string,
  lineIndex: number,
  text: string,
  expectedText?: string,
): Promise<MemoryDoc> {
  const clean = text.trim();
  if (!clean) throw new AccountError("Line text is required");
  const { doc, lines } = await bulletLines(profileId, key, lineIndex, expectedText);
  const m = BULLET.exec(lines[lineIndex]!)!;
  lines[lineIndex] = `${m[1]}${m[2]}${clean}`;
  return prisma.memoryDoc.update({ where: { id: doc.id }, data: { content: lines.join("\n") } });
}

export async function deleteMemoryLine(
  profileId: string,
  key: string,
  lineIndex: number,
  expectedText?: string,
): Promise<MemoryDoc> {
  const { doc, lines } = await bulletLines(profileId, key, lineIndex, expectedText);
  lines.splice(lineIndex, 1);
  return prisma.memoryDoc.update({ where: { id: doc.id }, data: { content: lines.join("\n") } });
}
