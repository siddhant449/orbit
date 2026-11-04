import { createHash } from "node:crypto";
import { Prisma, type SavedKind } from "../generated/prisma/client";
import { prisma } from "../client";

export class SavesError extends Error {
  constructor(
    public code: "invalid" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "SavesError";
  }
}

export type SpaceRow = { id: string; name: string; description: string | null; pinned: boolean; position: number; itemCount: number };
export type SavedItemRow = {
  id: string;
  kind: SavedKind;
  refId: string | null;
  snapshot: Record<string, unknown>;
  spaceIds: string[];
  available: boolean;
  createdAt: Date;
};

const NAME_MAX = 30;
const DESCRIPTION_MAX = 500;
const REF_KINDS: SavedKind[] = ["TEMPLATE", "POST", "VISUAL"];
const SPACE_SELECT = { id: true, name: true, description: true, pinned: true, position: true, _count: { select: { items: true } } } as const;

const toSpace = (s: { id: string; name: string; description: string | null; pinned: boolean; position: number; _count: { items: number } }): SpaceRow => ({
  id: s.id,
  name: s.name,
  description: s.description,
  pinned: s.pinned,
  position: s.position,
  itemCount: s._count.items,
});

function cleanName(name: unknown): string {
  const n = typeof name === "string" ? name.trim() : "";
  if (n.length < 1 || n.length > NAME_MAX) throw new SavesError("invalid", `A space name must be 1 to ${NAME_MAX} characters.`);
  return n;
}

function cleanDescription(d: unknown): string | null {
  if (d === undefined || d === null) return null;
  if (typeof d !== "string" || d.length > DESCRIPTION_MAX) throw new SavesError("invalid", `A description can be up to ${DESCRIPTION_MAX} characters.`);
  return d.trim() || null;
}

export async function listSpaces(profileId: string): Promise<SpaceRow[]> {
  const rows = await prisma.saveSpace.findMany({
    where: { profileId },
    orderBy: [{ pinned: "desc" }, { position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: SPACE_SELECT,
  });
  return rows.map(toSpace);
}

export async function createSpace(profileId: string, input: { name: string; description?: string }): Promise<SpaceRow> {
  const name = cleanName(input.name);
  const description = cleanDescription(input.description);
  const last = await prisma.saveSpace.aggregate({ where: { profileId }, _max: { position: true } });
  const row = await prisma.saveSpace.create({ data: { profileId, name, description, position: (last._max.position ?? -1) + 1 }, select: SPACE_SELECT });
  return toSpace(row);
}

export async function updateSpace(profileId: string, id: string, patch: { name?: string; description?: string | null; pinned?: boolean }): Promise<SpaceRow> {
  const data: Prisma.SaveSpaceUpdateManyMutationInput = {};
  if (patch.name !== undefined) data.name = cleanName(patch.name);
  if (patch.description !== undefined) data.description = cleanDescription(patch.description);
  if (patch.pinned !== undefined) data.pinned = Boolean(patch.pinned);
  const res = await prisma.saveSpace.updateMany({ where: { id, profileId }, data });
  if (res.count === 0) throw new SavesError("not_found", "Space not found.");
  const row = await prisma.saveSpace.findUniqueOrThrow({ where: { id }, select: SPACE_SELECT });
  return toSpace(row);
}

/** Deleting a space keeps its items in All saves. */
export async function deleteSpace(profileId: string, id: string): Promise<void> {
  const res = await prisma.saveSpace.deleteMany({ where: { id, profileId } });
  if (res.count === 0) throw new SavesError("not_found", "Space not found.");
}

async function assertOwnSpaces(profileId: string, spaceIds: string[]): Promise<string[]> {
  const ids = [...new Set(spaceIds)];
  if (ids.length === 0) return ids;
  const found = await prisma.saveSpace.count({ where: { profileId, id: { in: ids } } });
  if (found !== ids.length) throw new SavesError("not_found", "Space not found.");
  return ids;
}

const textKeyOf = (text: string) => createHash("sha256").update(text.trim()).digest("hex");

type ItemRecord = { id: string; kind: SavedKind; refId: string | null; snapshot: Prisma.JsonValue; createdAt: Date; spaces: { spaceId: string }[] };
const ITEM_INCLUDE = { spaces: { select: { spaceId: true } } } as const;

/** Whether each item's target still exists (a template this profile can see, or its own live post or image). Hooks and ideas live in their snapshot. */
async function availability(profileId: string, items: ItemRecord[]): Promise<Set<string>> {
  const ids = (kind: SavedKind) => items.filter((i) => i.kind === kind && i.refId).map((i) => i.refId!);
  const [templates, docs, visuals] = await Promise.all([
    prisma.template.findMany({ where: { id: { in: ids("TEMPLATE") }, OR: [{ system: true }, { profileId }] }, select: { id: true } }),
    prisma.document.findMany({ where: { id: { in: ids("POST") }, profileId, deletedAt: null }, select: { id: true } }),
    prisma.visual.findMany({ where: { id: { in: ids("VISUAL") }, profileId, deletedAt: null }, select: { id: true } }),
  ]);
  return new Set([...templates, ...docs, ...visuals].map((r) => r.id));
}

async function toRows(profileId: string, items: ItemRecord[]): Promise<SavedItemRow[]> {
  const live = await availability(profileId, items);
  return items.map((i) => ({
    id: i.id,
    kind: i.kind,
    refId: i.refId,
    snapshot: (i.snapshot && typeof i.snapshot === "object" && !Array.isArray(i.snapshot) ? i.snapshot : {}) as Record<string, unknown>,
    spaceIds: i.spaces.map((s) => s.spaceId),
    available: i.refId ? live.has(i.refId) : true,
    createdAt: i.createdAt,
  }));
}

async function oneRow(profileId: string, id: string): Promise<SavedItemRow> {
  const item = await prisma.savedItem.findFirst({ where: { id, profileId }, include: ITEM_INCLUDE });
  if (!item) throw new SavesError("not_found", "Saved item not found.");
  return (await toRows(profileId, [item]))[0]!;
}

async function appendToSpaces(itemId: string, spaceIds: string[]): Promise<void> {
  for (const spaceId of spaceIds) {
    const last = await prisma.savedItemSpace.aggregate({ where: { spaceId }, _max: { position: true } });
    await prisma.savedItemSpace.createMany({ data: [{ itemId, spaceId, position: (last._max.position ?? -1) + 1 }], skipDuplicates: true });
  }
}

/** Saves once per (profile, kind, ref), or per (profile, kind, text) when there is no ref. Saving again only adds the given spaces. */
export async function saveItem(
  profileId: string,
  input: { kind: SavedKind; refId?: string | null; snapshot: Record<string, unknown>; spaceIds?: string[] },
): Promise<SavedItemRow> {
  const { kind, snapshot } = input;
  const refId = input.refId ?? null;
  if (!["TEMPLATE", "HOOK", "IDEA", "POST", "VISUAL"].includes(kind)) throw new SavesError("invalid", "Unknown kind.");
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new SavesError("invalid", "A snapshot is required.");
  let textKey: string | null = null;
  if (REF_KINDS.includes(kind)) {
    if (!refId) throw new SavesError("invalid", "A reference is required.");
  } else {
    const text = snapshot.text;
    if (typeof text !== "string" || !text.trim()) throw new SavesError("invalid", "There is nothing to save.");
    if (refId) throw new SavesError("invalid", "Hooks and ideas have no reference.");
    textKey = textKeyOf(text);
  }
  const spaceIds = await assertOwnSpaces(profileId, input.spaceIds ?? []);
  const where = refId ? { profileId, kind, refId } : { profileId, kind, textKey };
  let item = await prisma.savedItem.findFirst({ where, select: { id: true } });
  if (!item) {
    try {
      item = await prisma.savedItem.create({ data: { profileId, kind, refId, textKey, snapshot: snapshot as Prisma.InputJsonObject }, select: { id: true } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      item = await prisma.savedItem.findFirstOrThrow({ where, select: { id: true } });
    }
  }
  await appendToSpaces(item.id, spaceIds);
  return oneRow(profileId, item.id);
}

export async function unsaveItem(profileId: string, itemId: string): Promise<void> {
  const res = await prisma.savedItem.deleteMany({ where: { id: itemId, profileId } });
  if (res.count === 0) throw new SavesError("not_found", "Saved item not found.");
}

export async function listSaved(
  profileId: string,
  q: { kind?: SavedKind; spaceId?: string; cursor?: string; limit: number },
): Promise<{ items: SavedItemRow[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, Math.floor(q.limit) || 1));
  const kindWhere = q.kind ? { kind: q.kind } : {};
  if (q.spaceId) {
    await assertOwnSpaces(profileId, [q.spaceId]);
    const links = await prisma.savedItemSpace.findMany({
      where: { spaceId: q.spaceId, item: { profileId, ...kindWhere } },
      orderBy: [{ position: "asc" }, { itemId: "asc" }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { itemId_spaceId: { itemId: q.cursor, spaceId: q.spaceId } }, skip: 0 } : {}),
      include: { item: { include: ITEM_INCLUDE } },
    });
    const page = links.slice(0, limit);
    return { items: await toRows(profileId, page.map((l) => l.item)), nextCursor: links.length > limit ? links[limit]!.itemId : null };
  }
  const items = await prisma.savedItem.findMany({
    where: { profileId, ...kindWhere },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor } } : {}),
    include: ITEM_INCLUDE,
  });
  return { items: await toRows(profileId, items.slice(0, limit)), nextCursor: items.length > limit ? items[limit]!.id : null };
}

/** Replaces the spaces an item lives in. */
export async function setItemSpaces(profileId: string, itemId: string, spaceIds: string[]): Promise<SavedItemRow> {
  const item = await prisma.savedItem.findFirst({ where: { id: itemId, profileId }, select: { id: true } });
  if (!item) throw new SavesError("not_found", "Saved item not found.");
  const ids = await assertOwnSpaces(profileId, spaceIds);
  await prisma.savedItemSpace.deleteMany({ where: { itemId, spaceId: { notIn: ids } } });
  await appendToSpaces(itemId, ids);
  return oneRow(profileId, itemId);
}

/** Puts the given items first, in that order; items the list leaves out keep their relative order after them. */
export async function reorderSpaceItems(profileId: string, spaceId: string, itemIds: string[]): Promise<void> {
  await assertOwnSpaces(profileId, [spaceId]);
  const current = await prisma.savedItemSpace.findMany({ where: { spaceId }, orderBy: [{ position: "asc" }, { itemId: "asc" }], select: { itemId: true } });
  const inSpace = new Set(current.map((c) => c.itemId));
  const first = [...new Set(itemIds)].filter((id) => inSpace.has(id));
  const rest = current.map((c) => c.itemId).filter((id) => !first.includes(id));
  await prisma.$transaction(
    [...first, ...rest].map((id, position) => prisma.savedItemSpace.update({ where: { itemId_spaceId: { itemId: id, spaceId } }, data: { position } })),
  );
}
