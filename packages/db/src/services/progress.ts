import { prisma } from "../client";
import { memoryLines } from "./memory";

export type ProgressSignals = {
  /** Creation times of the profile's live drafts (documents) since `since`. */
  draftDates: Date[];
  /** All live drafts, ever. */
  draftTotal: number;
  hasStrategy: boolean;
  /** Knowledge items that finished processing. */
  knowledgeReady: number;
  /** A voice learned from the writer's own pasted posts (kind OWN). */
  hasOwnVoice: boolean;
  /** At least one line in an `identity/*` memory. */
  hasIdentity: boolean;
};

/**
 * Read-only signals for Activities and the 30-day sprint, derived from data Orbit already stores. There is no
 * progress table yet: a "draft" here is a document created in chat, never a published post.
 */
export async function getProgressSignals(profileId: string, since: Date): Promise<ProgressSignals> {
  const live = { profileId, deletedAt: null };
  const [drafts, draftTotal, strategy, knowledgeReady, ownVoices, identity] = await Promise.all([
    prisma.document.findMany({
      where: { ...live, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.document.count({ where: live }),
    prisma.strategy.findUnique({ where: { profileId }, select: { id: true } }),
    prisma.knowledgeItem.count({ where: { profileId, status: "READY" } }),
    prisma.voiceStyle.count({ where: { profileId, kind: "OWN" } }),
    prisma.memoryDoc.findMany({ where: { profileId, key: { startsWith: "identity/" } }, select: { content: true } }),
  ]);
  return {
    draftDates: drafts.map((d) => d.createdAt),
    draftTotal,
    hasStrategy: !!strategy,
    knowledgeReady,
    hasOwnVoice: ownVoices > 0,
    hasIdentity: identity.some((d) => memoryLines(d.content).length > 0),
  };
}
