import { StyleProfileSchema, type StyleProfile } from "@brandloop/ai";
import { prisma } from "../client";
import type { Prisma, VoiceStyle } from "../generated/prisma/client";
import { AccountError } from "./account";
import { renderProfileGuide } from "./style-guide";

export { renderProfileGuide };

/** Compiled versions kept per style. */
export const STYLE_VERSIONS_KEPT = 10;

/** A preset, or the caller's own style. Another profile's own style is invisible. */
async function visibleStyle(profileId: string, voiceStyleId: string): Promise<VoiceStyle | null> {
  const row = await prisma.voiceStyle.findUnique({ where: { id: voiceStyleId } });
  return row && (row.kind === "PRESET" || row.profileId === profileId) ? row : null;
}

async function ownStyle(profileId: string, voiceStyleId: string): Promise<VoiceStyle | null> {
  const row = await prisma.voiceStyle.findUnique({ where: { id: voiceStyleId } });
  return row && row.kind === "OWN" && row.profileId === profileId ? row : null;
}

/** The style row with its compiled profile (null for a row that only has a prose guide), or null when it isn't visible. */
export async function getStyleProfile(profileId: string, voiceStyleId: string): Promise<{ style: VoiceStyle; profile: StyleProfile | null } | null> {
  const style = await visibleStyle(profileId, voiceStyleId);
  if (!style) return null;
  const parsed = StyleProfileSchema.safeParse(style.styleProfile);
  return { style, profile: parsed.success ? parsed.data : null };
}

/**
 * Stores a compiled profile as the next version, keeps the last STYLE_VERSIONS_KEPT, marks the style READY and rewrites
 * `guide` from the profile (design §2.3). The profile is validated here, so nothing unvalidated is ever stored.
 */
export async function saveStyleProfile(voiceStyleId: string, profile: StyleProfile, corpusHash: string): Promise<{ version: number }> {
  const valid = StyleProfileSchema.parse(profile);
  const style = await prisma.voiceStyle.findUnique({ where: { id: voiceStyleId } });
  if (!style) throw new AccountError("Writing style not found");
  const version = style.profileVersion + 1;
  const json = valid as unknown as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.voiceStyle.update({
      where: { id: voiceStyleId },
      data: {
        styleProfile: json,
        profileVersion: version,
        corpusHash,
        status: "READY",
        statusDetail: null,
        analyzedPostCount: valid.source.postCount,
        analyzedAt: new Date(),
        guide: renderProfileGuide(valid),
      },
    }),
    prisma.voiceStyleVersion.create({ data: { voiceStyleId, version, profile: json, corpusHash } }),
    prisma.voiceStyleVersion.deleteMany({ where: { voiceStyleId, version: { lte: version - STYLE_VERSIONS_KEPT } } }),
  ]);
  return { version };
}

/** Newest first; null when the style isn't the caller's own. */
export async function listStyleVersions(profileId: string, voiceStyleId: string): Promise<{ version: number; createdAt: Date; corpusHash: string }[] | null> {
  if (!(await ownStyle(profileId, voiceStyleId))) return null;
  return prisma.voiceStyleVersion.findMany({
    where: { voiceStyleId },
    orderBy: { version: "desc" },
    select: { version: true, createdAt: true, corpusHash: true },
  });
}

/** Saves an earlier version again as the newest one. Own styles only. */
export async function restoreStyleVersion(profileId: string, voiceStyleId: string, version: number): Promise<{ version: number }> {
  if (!(await ownStyle(profileId, voiceStyleId))) throw new AccountError("Writing style not found");
  const old = await prisma.voiceStyleVersion.findUnique({ where: { voiceStyleId_version: { voiceStyleId, version } } });
  if (!old) throw new AccountError("That version is no longer kept");
  return saveStyleProfile(voiceStyleId, StyleProfileSchema.parse(old.profile), old.corpusHash);
}
