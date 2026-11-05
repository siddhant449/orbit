import { prisma } from "../client";

export type IdeaOrigin = "weekly" | "chat";

export type IdeaInput = {
  category: string;
  title: string;
  detail: string;
  prompt: string;
  sourceKind: string;
  sourceRef?: string | null;
};

export type IdeaRow = {
  id: string;
  weekStartOn: string;
  origin: IdeaOrigin;
  position: number;
  category: string;
  title: string;
  detail: string;
  prompt: string;
  sourceKind: string;
  sourceRef: string | null;
  drafted: boolean;
  chatId: string | null;
  hidden: boolean;
  createdAt: Date;
};

type Row = Awaited<ReturnType<typeof prisma.idea.findFirstOrThrow>>;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toRow = (r: Row): IdeaRow => ({ ...r, weekStartOn: r.weekStartOn.toISOString().slice(0, 10), origin: r.origin as IdeaOrigin });

/**
 * Stores a batch for a week. A weekly batch is idempotent: positions 0..n-1 sit under a unique key, so a second (or
 * concurrent) call for the same week creates nothing and returns the stored rows. Chat batches append to the week's
 * chat ideas instead, since the picker can run many times a week.
 */
export async function saveIdeaBatch(
  profileId: string,
  weekStartOn: string,
  origin: IdeaOrigin,
  ideas: IdeaInput[],
): Promise<{ created: boolean; ideas: IdeaRow[] }> {
  const week = day(weekStartOn);
  const data = (start: number) =>
    ideas.map((i, n) => ({
      profileId,
      weekStartOn: week,
      origin,
      position: start + n,
      category: i.category,
      title: i.title,
      detail: i.detail,
      prompt: i.prompt,
      sourceKind: i.sourceKind,
      sourceRef: i.sourceRef ?? null,
    }));
  if (ideas.length === 0) return { created: false, ideas: [] };

  if (origin === "weekly") {
    const { count } = await prisma.idea.createMany({ data: data(0), skipDuplicates: true });
    const rows = await prisma.idea.findMany({ where: { profileId, weekStartOn: week, origin }, orderBy: { position: "asc" } });
    return { created: count > 0, ideas: rows.map(toRow) };
  }

  class Collision extends Error {}
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.idea.aggregate({ where: { profileId, weekStartOn: week, origin }, _max: { position: true } });
        const start = (last._max.position ?? -1) + 1;
        const { count } = await tx.idea.createMany({ data: data(start), skipDuplicates: true });
        // A concurrent batch took some of these positions: roll back and try again past it.
        if (count !== ideas.length) throw new Collision();
        const rows = await tx.idea.findMany({ where: { profileId, weekStartOn: week, origin, position: { gte: start } }, orderBy: { position: "asc" } });
        return { created: true, ideas: rows.map(toRow) };
      });
    } catch (err) {
      if (!(err instanceof Collision)) throw err;
    }
  }
  return { created: false, ideas: [] };
}

/** The newest `weeks` weeks that have ideas, newest first; each holds the weekly batch then the chat ideas. */
export async function listIdeaWeeks(profileId: string, { weeks }: { weeks: number }): Promise<{ weekStartOn: string; ideas: IdeaRow[] }[]> {
  const starts = await prisma.idea.findMany({
    where: { profileId },
    distinct: ["weekStartOn"],
    orderBy: { weekStartOn: "desc" },
    take: Math.max(1, Math.min(weeks, 52)),
    select: { weekStartOn: true },
  });
  if (starts.length === 0) return [];
  const rows = await prisma.idea.findMany({
    where: { profileId, weekStartOn: { in: starts.map((s) => s.weekStartOn) } },
    orderBy: [{ weekStartOn: "desc" }, { origin: "desc" }, { position: "asc" }],
  });
  return starts.map((s) => ({
    weekStartOn: s.weekStartOn.toISOString().slice(0, 10),
    ideas: rows.filter((r) => r.weekStartOn.getTime() === s.weekStartOn.getTime()).map(toRow),
  }));
}

/** Whether the profile already has a weekly batch for this week. */
export async function hasWeeklyBatch(profileId: string, weekStartOn: string): Promise<boolean> {
  return (await prisma.idea.count({ where: { profileId, weekStartOn: day(weekStartOn), origin: "weekly" } })) > 0;
}

export async function getIdea(profileId: string, id: string): Promise<IdeaRow | null> {
  const row = await prisma.idea.findFirst({ where: { id, profileId } });
  return row ? toRow(row) : null;
}

/** Another profile's idea (or a missing one) is a no-op that returns false. */
export async function setIdeaHidden(profileId: string, id: string, hidden: boolean): Promise<boolean> {
  const { count } = await prisma.idea.updateMany({ where: { id, profileId }, data: { hidden } });
  return count > 0;
}

/** Marks the idea drafted and records the chat, once: the first chat wins, later calls change nothing. */
export async function markIdeaDrafted(profileId: string, id: string, chatId: string): Promise<boolean> {
  const { count } = await prisma.idea.updateMany({ where: { id, profileId, chatId: null }, data: { drafted: true, chatId } });
  return count > 0;
}
