import { prisma } from "../client";

/** Per-profile app settings kept as hidden `prefs/…` MemoryDoc rows (no schema change); `listMemory` skips them. */
const AI_MODEL_KEY = "prefs/ai-model";

export async function getAiModelPref(profileId: string): Promise<string | null> {
  const row = await prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId, key: AI_MODEL_KEY } }, select: { content: true } });
  return row?.content.trim() || null;
}

/** Saves the chosen model id. The caller validates it against the allowlist; null clears it. */
export async function setAiModelPref(profileId: string, modelId: string | null): Promise<void> {
  if (modelId === null) {
    await prisma.memoryDoc.deleteMany({ where: { profileId, key: AI_MODEL_KEY } });
    return;
  }
  await prisma.memoryDoc.upsert({
    where: { profileId_key: { profileId, key: AI_MODEL_KEY } },
    create: { profileId, key: AI_MODEL_KEY, content: modelId },
    update: { content: modelId },
  });
}
