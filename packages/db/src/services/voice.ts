import type { AiClient } from "@brandloop/ai";
import { prisma } from "../client";
import type { VoiceStyle } from "../generated/prisma/client";
import { AccountError, assertProfileAccess } from "./account";
import { extractOwnStyle, prepareOwnStyle, STYLE_POSTS_ERROR, validateStylePosts } from "./style-extract";

export const VOICE_POSTS_ERROR = STYLE_POSTS_ERROR;

/** The profile's own style first, then presets in name order. */
export async function listVoices(profileId: string): Promise<VoiceStyle[]> {
  const rows = await prisma.voiceStyle.findMany({
    where: { OR: [{ kind: "PRESET" }, { profileId }] },
    orderBy: { name: "asc" },
  });
  return [...rows.filter((v) => v.profileId === profileId), ...rows.filter((v) => v.profileId !== profileId)];
}

export async function selectVoice(userId: string, profileId: string, voiceStyleId: string): Promise<void> {
  await assertProfileAccess(userId, profileId);
  const voice = await prisma.voiceStyle.findUnique({ where: { id: voiceStyleId } });
  const allowed = voice && (voice.kind === "PRESET" || voice.profileId === profileId);
  if (!allowed) throw new AccountError("Writing style not found");
  await prisma.profile.update({ where: { id: profileId }, data: { voiceStyleId } });
}

export async function getSelectedVoice(profileId: string): Promise<VoiceStyle | null> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, include: { voiceStyle: true } });
  if (profile?.voiceStyle) return profile.voiceStyle;
  return prisma.voiceStyle.findFirst({ where: { profileId, kind: "OWN" }, orderBy: { updatedAt: "desc" } });
}

export { validateStylePosts as validateVoicePosts };

/** Kept for existing callers: stores the pasted posts as the corpus and compiles the style (Task W4's pipeline). */
export async function createOwnVoice(ai: AiClient, profileId: string, posts: string[]): Promise<VoiceStyle> {
  const cleaned = validateStylePosts(posts);
  const { voiceStyleId } = await prepareOwnStyle(profileId, cleaned, "PASTE");
  await extractOwnStyle(ai, profileId, voiceStyleId);
  return prisma.voiceStyle.findUniqueOrThrow({ where: { id: voiceStyleId } });
}
