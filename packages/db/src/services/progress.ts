import { prisma } from "../client";
import { memoryLines } from "./memory";

export type ProgressSignals = {
  /** Creation times of the profile's live drafts (documents) since `since`. */
  draftDates: Date[];
  /** All live drafts, ever. */
  draftTotal: number;
  /** `postedAt` of the profile's live posts marked as posted since `since`. These drive the posts goal, streaks and badges. */
  postedDates: Date[];
  /** Live posts marked as posted, ever. */
  postedTotal: number;
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
 * separate progress table: a "draft" is a document created in chat, and a "posted" post is one the writer marked as posted
 * (`Document.postedAt`). Neither means anything was published.
 */
export async function getProgressSignals(profileId: string, since: Date): Promise<ProgressSignals> {
  const live = { profileId, deletedAt: null };
  const [drafts, draftTotal, posted, postedTotal, strategy, knowledgeReady, ownVoices, identity] = await Promise.all([
    prisma.document.findMany({
      where: { ...live, createdAt: { gte: since } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.document.count({ where: live }),
    prisma.document.findMany({ where: { ...live, postedAt: { gte: since } }, select: { postedAt: true }, orderBy: { postedAt: "asc" } }),
    prisma.document.count({ where: { ...live, postedAt: { not: null } } }),
    prisma.strategy.findUnique({ where: { profileId }, select: { id: true } }),
    prisma.knowledgeItem.count({ where: { profileId, status: "READY" } }),
    prisma.voiceStyle.count({ where: { profileId, kind: "OWN" } }),
    prisma.memoryDoc.findMany({ where: { profileId, key: { startsWith: "identity/" } }, select: { content: true } }),
  ]);
  return {
    draftDates: drafts.map((d) => d.createdAt),
    draftTotal,
    postedDates: posted.flatMap((d) => (d.postedAt ? [d.postedAt] : [])),
    postedTotal,
    hasStrategy: !!strategy,
    knowledgeReady,
    hasOwnVoice: ownVoices > 0,
    hasIdentity: identity.some((d) => memoryLines(d.content).length > 0),
  };
}
