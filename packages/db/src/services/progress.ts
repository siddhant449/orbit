import { prisma } from "../client";

export type ProgressSignals = {
  /** Creation times of the profile's live drafts (documents) since `since`. */
  draftDates: Date[];
  /** All live drafts, ever. */
  draftTotal: number;
  hasStrategy: boolean;
  /** Knowledge items that finished processing. */
  knowledgeReady: number;
  hasOwnVoice: boolean;
};

/**
 * Read-only signals for Activities and the 30-day sprint, derived from data Orbit already stores. There is no
 * progress table yet: a "draft" here is a document created in chat, never a published post.
 */
export async function getProgressSignals(profileId: string, since: Date): Promise<ProgressSignals> {
  const live = { profileId, deletedAt: null };
  const [drafts, draftTotal, strategy, knowledgeReady, ownVoices] = await Promise.all([
    prisma.document.findMany({
      where: { ...live, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.document.count({ where: live }),
    prisma.strategy.findUnique({ where: { profileId }, select: { id: true } }),
    prisma.knowledgeItem.count({ where: { profileId, status: "READY" } }),
    prisma.voiceStyle.count({ where: { profileId, kind: { in: ["OWN", "URL"] } } }),
  ]);
  return {
    draftDates: drafts.map((d) => d.createdAt),
    draftTotal,
    hasStrategy: !!strategy,
    knowledgeReady,
    hasOwnVoice: ownVoices > 0,
  };
}
