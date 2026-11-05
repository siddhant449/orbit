import type { SavedIdeaCard } from "@brandloop/agent";
import { prisma, saveIdeaBatch } from "@brandloop/db";
import { weekStartOn } from "./week";

/** The ideas the chat picker showed, kept as this week's origin "chat" ideas so they stop vanishing with the tab. */
export async function saveChatIdeas(profileId: string, cards: SavedIdeaCard[], now = new Date()): Promise<void> {
  if (cards.length === 0) return;
  const profile = await prisma.profile.findFirst({ where: { id: profileId, deletedAt: null }, select: { timezone: true } });
  if (!profile) return;
  await saveIdeaBatch(
    profileId,
    weekStartOn(now, profile.timezone),
    "chat",
    cards.map((c) => ({
      category: c.badge,
      title: c.hook.slice(0, 160),
      detail: c.angle,
      prompt: [`Write a LinkedIn post from this idea.`, `Opening line to start from: ${c.hook}`, `Angle: ${c.angle}`].join("\n"),
      sourceKind: c.sourceKind,
      sourceRef: c.sourceRef,
    })),
  );
}
