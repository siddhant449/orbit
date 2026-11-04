import { randomBytes } from "node:crypto";
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
  /** "popular": likes plus uses in the last 30 days, then all-time likes plus uses, then title. "newest": newest first. Omitted: by category and title. */
  sort?: "popular" | "newest";
  offset?: number;
  limit?: number;
};

export type TemplateListItem = TemplateRow & { saved: boolean; liked: boolean; own: boolean };

export class TemplateError extends Error {
  constructor(
    public code: "invalid" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

export const TEMPLATE_TITLE_MAX = 80;
export const TEMPLATE_SKELETON_MAX = 3000;
export const TEMPLATE_WHY_MAX = 200;
const SLOT = /\[[^\[\]\n]+\]/;
const POPULAR_WINDOW_MS = 30 * 24 * 60 * 60_000;

export async function listTemplates(q: TemplateQuery): Promise<{ items: TemplateListItem[]; total: number }> {
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
  const skip = q.offset ?? 0;
  const take = q.limit ?? 50;
  let rows: Template[];
  let total: number;
  if (q.sort === "popular") {
    const [all, recentUses, recentLikes] = await Promise.all([
      prisma.template.findMany({ where, select: { id: true, title: true, likeCount: true, useCount: true } }),
      prisma.templateUse.groupBy({ by: ["templateId"], where: { createdAt: { gte: new Date(Date.now() - POPULAR_WINDOW_MS) }, template: where }, _count: { _all: true } }),
      prisma.templateLike.groupBy({ by: ["templateId"], where: { createdAt: { gte: new Date(Date.now() - POPULAR_WINDOW_MS) }, template: where }, _count: { _all: true } }),
    ]);
    const recent = new Map<string, number>();
    for (const r of [...recentUses, ...recentLikes]) recent.set(r.templateId, (recent.get(r.templateId) ?? 0) + r._count._all);
    const ranked = all.sort(
      (a, b) =>
        (recent.get(b.id) ?? 0) - (recent.get(a.id) ?? 0) ||
        b.likeCount + b.useCount - (a.likeCount + a.useCount) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
    total = ranked.length;
    const pageIds = ranked.slice(skip, skip + take).map((r) => r.id);
    const byId = new Map((await prisma.template.findMany({ where: { id: { in: pageIds } } })).map((t) => [t.id, t]));
    rows = pageIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  } else {
    const orderBy: Prisma.TemplateOrderByWithRelationInput[] =
      q.sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : [{ category: "asc" }, { title: "asc" }, { id: "asc" }];
    [rows, total] = await Promise.all([prisma.template.findMany({ where, orderBy, skip, take }), prisma.template.count({ where })]);
  }
  const ids = rows.map((r) => r.id);
  const [saved, liked] = viewer
    ? await Promise.all([
        savedIds ? Promise.resolve(new Set(savedIds)) : savedTemplateIds(viewer).then((x) => new Set(x)),
        prisma.templateLike.findMany({ where: { profileId: viewer, templateId: { in: ids } }, select: { templateId: true } }).then((x) => new Set(x.map((l) => l.templateId))),
      ])
    : [new Set<string>(), new Set<string>()];
  const items = rows.map((t) => ({ ...t, saved: saved.has(t.id), liked: liked.has(t.id), own: !t.system && t.profileId === viewer }));
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
  await prisma.$transaction([
    prisma.templateUse.create({ data: input }),
    prisma.template.update({ where: { id: input.templateId }, data: { useCount: { increment: 1 } } }),
  ]);
}

export type OwnTemplateInput = { title: string; type: TemplateType; category: string; skeleton: string; why?: string | null };

type CleanTemplate = { title?: string; type?: TemplateType; category?: string; skeleton?: string; why?: string };

function cleanTemplate(input: Partial<OwnTemplateInput>, partial: boolean): CleanTemplate {
  const out: CleanTemplate = {};
  if (!partial || input.title !== undefined) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title || title.length > TEMPLATE_TITLE_MAX) throw new TemplateError("invalid", `A name must be 1 to ${TEMPLATE_TITLE_MAX} characters.`);
    out.title = title;
  }
  if (!partial || input.type !== undefined) {
    if (input.type !== "HOOK" && input.type !== "POST") throw new TemplateError("invalid", "Choose Hook or Post.");
    out.type = input.type;
  }
  if (!partial || input.category !== undefined) {
    const category = typeof input.category === "string" ? input.category.trim() : "";
    if (!category || category.length > 60) throw new TemplateError("invalid", "Choose a category.");
    out.category = category;
  }
  if (!partial || input.skeleton !== undefined) {
    const skeleton = typeof input.skeleton === "string" ? input.skeleton.trim() : "";
    if (!skeleton || skeleton.length > TEMPLATE_SKELETON_MAX) throw new TemplateError("invalid", `The text must be 1 to ${TEMPLATE_SKELETON_MAX} characters.`);
    if (!SLOT.test(skeleton)) throw new TemplateError("invalid", "Add at least one [slot] for the part that changes each time.");
    out.skeleton = skeleton;
  }
  if (input.why !== undefined) {
    const why = (input.why ?? "").trim();
    if (why.length > TEMPLATE_WHY_MAX) throw new TemplateError("invalid", `Why it works can be up to ${TEMPLATE_WHY_MAX} characters.`);
    out.why = why;
  }
  return out;
}

/** A template of the profile's own (`system=false`, slug `own-<id>`). The skeleton needs at least one `[slot]`. */
export async function createTemplate(profileId: string, input: OwnTemplateInput): Promise<TemplateRow> {
  const v = cleanTemplate(input, false) as Required<Omit<CleanTemplate, "why">> & { why?: string };
  return prisma.template.create({
    data: { slug: `own-${randomBytes(12).toString("hex")}`, type: v.type, category: v.category, title: v.title, skeleton: v.skeleton, why: v.why ?? "", beats: [], needs: [], tags: [], system: false, profileId },
  });
}

async function ownTemplate(profileId: string, id: string): Promise<TemplateRow> {
  const t = await prisma.template.findFirst({ where: { id, profileId, system: false } });
  if (!t) throw new TemplateError("not_found", "Template not found.");
  return t;
}

/** Owner only: another profile's template, or a shipped one, is not found. */
export async function updateTemplate(profileId: string, id: string, patch: Partial<OwnTemplateInput>): Promise<TemplateRow> {
  await ownTemplate(profileId, id);
  return prisma.template.update({ where: { id }, data: cleanTemplate(patch, true) });
}

export async function deleteTemplate(profileId: string, id: string): Promise<void> {
  await ownTemplate(profileId, id);
  await prisma.template.delete({ where: { id } });
}

/** Like or unlike; `likeCount` moves in the same transaction, and only when a row really was added or removed. */
export async function setTemplateLiked(profileId: string, templateId: string, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  const t = await prisma.template.findFirst({ where: { id: templateId, OR: [{ system: true }, { profileId }] }, select: { id: true } });
  if (!t) throw new TemplateError("not_found", "Template not found.");
  return prisma.$transaction(async (tx) => {
    if (liked) {
      const { count } = await tx.templateLike.createMany({ data: [{ profileId, templateId }], skipDuplicates: true });
      if (count) await tx.template.update({ where: { id: templateId }, data: { likeCount: { increment: 1 } } });
    } else {
      const { count } = await tx.templateLike.deleteMany({ where: { profileId, templateId } });
      if (count) await tx.template.update({ where: { id: templateId }, data: { likeCount: { decrement: 1 } } });
    }
    const row = await tx.template.findUniqueOrThrow({ where: { id: templateId }, select: { likeCount: true } });
    return { liked, likeCount: row.likeCount };
  });
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
