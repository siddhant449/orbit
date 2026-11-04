import { Prisma, type Template, type TemplateType } from "../generated/prisma/client";
import { prisma } from "../client";
import { saveItem } from "./saves";

export type TemplateRow = Template;
export type SeedTemplate = {
  slug: string;
  type: TemplateType;
  category: string;
  title: string;
  skeleton: string;
  beats: string[];
  why: string;
  needs: string[];
  tags: string[];
};

export type TemplateQuery = {
  type?: TemplateType;
  category?: string;
  search?: string;
  savedBy?: string;
  /** Only the shipped templates and this profile's own (other profiles' templates never show). */
  ownerProfileId?: string;
  offset?: number;
  limit?: number;
};

export async function listTemplates(q: TemplateQuery): Promise<{ items: (TemplateRow & { saved: boolean })[]; total: number }> {
  const search = q.search?.trim();
  const savedIds = q.savedBy ? await savedTemplateIds(q.savedBy) : null;
  const where: Prisma.TemplateWhereInput = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(savedIds ? { id: { in: savedIds } } : {}),
    ...(q.ownerProfileId ? { AND: [{ OR: [{ system: true }, { profileId: q.ownerProfileId }] }] } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { skeleton: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
            { tags: { has: search.toLowerCase() } },
          ],
        }
      : {}),
  };
  const viewer = q.ownerProfileId ?? q.savedBy;
  const [rows, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: [{ category: "asc" }, { title: "asc" }, { id: "asc" }],
      skip: q.offset ?? 0,
      take: q.limit ?? 50,
    }),
    prisma.template.count({ where }),
  ]);
  const saved = viewer ? new Set(savedIds ?? (await savedTemplateIds(viewer))) : new Set<string>();
  const items = rows.map((t) => ({ ...t, saved: saved.has(t.id) }));
  return { items, total };
}

export function getTemplateBySlug(slug: string): Promise<TemplateRow | null> {
  return prisma.template.findUnique({ where: { slug } });
}

async function savedTemplateIds(profileId: string): Promise<string[]> {
  const rows = await prisma.savedItem.findMany({ where: { profileId, kind: "TEMPLATE", refId: { not: null } }, select: { refId: true } });
  return rows.map((r) => r.refId!);
}

/** The heart/bookmark on a template card: one SavedItem per profile and template. */
export async function setTemplateSaved(profileId: string, templateId: string, saved: boolean): Promise<void> {
  if (saved) {
    const t = await prisma.template.findUnique({ where: { id: templateId }, select: { title: true } });
    await saveItem(profileId, { kind: "TEMPLATE", refId: templateId, snapshot: { title: t?.title ?? "" } });
  } else {
    await prisma.savedItem.deleteMany({ where: { profileId, kind: "TEMPLATE", refId: templateId } });
  }
}

export async function recordTemplateUse(input: { profileId: string; templateId: string; documentId: string | null; source: "auto" | "picked" }): Promise<void> {
  await prisma.templateUse.create({ data: input });
}

/** Stores how much the writer rewrote the draft on the document's newest template use (a no-op when it has none). */
export async function setTemplateUseEditRatio(profileId: string, documentId: string, editRatio: number): Promise<void> {
  const use = await prisma.templateUse.findFirst({ where: { profileId, documentId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (use) await prisma.templateUse.update({ where: { id: use.id }, data: { editRatio: Math.min(1, Math.max(0, editRatio)) } });
}

export function recentTemplateUses(profileId: string, limit: number): Promise<{ templateId: string; createdAt: Date }[]> {
  return prisma.templateUse.findMany({ where: { profileId }, orderBy: { createdAt: "desc" }, take: limit, select: { templateId: true, createdAt: true } });
}

/** Per template: the mean of `1 - editRatio` over this profile's uses that have a ratio (a lightly edited draft scores high). */
export async function templateScores(profileId: string): Promise<Map<string, number>> {
  const rows = await prisma.templateUse.groupBy({ by: ["templateId"], where: { profileId, editRatio: { not: null } }, _avg: { editRatio: true } });
  const scores = new Map<string, number>();
  for (const r of rows) scores.set(r.templateId, 1 - (r._avg.editRatio ?? 0.5));
  return scores;
}

/** Insert or refresh the shipped templates by slug. Never touches user-made rows. */
export async function upsertSystemTemplates(rows: SeedTemplate[]): Promise<number> {
  for (const r of rows) {
    await prisma.template.upsert({ where: { slug: r.slug }, create: { ...r, system: true }, update: { ...r, system: true } });
  }
  return rows.length;
}
