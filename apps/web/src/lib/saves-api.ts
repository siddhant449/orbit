import {
  createSpace,
  deleteSpace,
  listSaved,
  listSpaces,
  prisma,
  reorderSpaceItems,
  saveItem,
  SavesError,
  setItemSpaces,
  unsaveItem,
  updateSpace,
  type SavedKind,
} from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";

export const SAVES_BODY_MAX_BYTES = 8 * 1024;
const KINDS = ["TEMPLATE", "HOOK", "IDEA", "POST", "VISUAL"] as const;

const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });
const NEED_PROFILE = () => fail(400, "Create a profile first.");

// 60 writes per profile per 10 minutes, shared by every save and space write; survives dev hot reloads.
const globalLimiter = globalThis as unknown as { __savesLimiter?: RateLimiter };
const defaultLimiter = () => (globalLimiter.__savesLimiter ??= createRateLimiter({ limit: 60, windowMs: 10 * 60_000 }));
export type SavesDeps = { limiter?: RateLimiter };

type Ctx = { params: Promise<{ id: string }> };

async function profileId(): Promise<string | null> {
  return (await getAccount())?.currentProfile?.id ?? null;
}

async function readBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SAVES_BODY_MAX_BYTES) return { ok: false, status: 413, error: "That request is too large." };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > SAVES_BODY_MAX_BYTES) return { ok: false, status: 413, error: "That request is too large." };
  try {
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, status: 400, error: "That request wasn't valid." };
  }
}

function limited(deps: SavesDeps, id: string): Response | null {
  const gate = (deps.limiter ?? defaultLimiter()).take(id);
  if (gate.ok) return null;
  return fail(429, "You've saved a lot in the last few minutes. Try again shortly.", { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) });
}

function fromError(err: unknown): Response {
  if (err instanceof SavesError) return err.code === "not_found" ? fail(404, "That wasn't found.") : fail(400, err.message);
  throw err;
}

/** Runs a write: profile, rate limit, size-capped JSON body validated by `schema`, then `run`. */
async function write<T>(request: Request, deps: SavesDeps, schema: z.ZodType<T>, invalid: string, run: (pid: string, body: T) => Promise<Response>): Promise<Response> {
  const pid = await profileId();
  if (!pid) return NEED_PROFILE();
  const gate = limited(deps, pid);
  if (gate) return gate;
  const raw = await readBody(request);
  if (!raw.ok) return fail(raw.status, raw.error);
  const body = schema.safeParse(raw.value);
  if (!body.success) return fail(400, invalid);
  try {
    return await run(pid, body.data);
  } catch (err) {
    return fromError(err);
  }
}

const SaveBody = z.object({
  kind: z.enum(KINDS),
  refId: z.string().min(1).max(64).optional(),
  snapshot: z.record(z.string(), z.unknown()),
  spaceIds: z.array(z.string().max(64)).max(50).optional(),
});

/** The target of a template, post or image save must exist and be this profile's (templates: shipped or own). */
async function ownsTarget(pid: string, kind: SavedKind, refId: string | undefined): Promise<boolean> {
  if (!refId) return true;
  if (kind === "TEMPLATE") return Boolean(await prisma.template.findFirst({ where: { id: refId, OR: [{ system: true }, { profileId: pid }] }, select: { id: true } }));
  if (kind === "POST") return Boolean(await prisma.document.findFirst({ where: { id: refId, profileId: pid, deletedAt: null }, select: { id: true } }));
  if (kind === "VISUAL") return Boolean(await prisma.visual.findFirst({ where: { id: refId, profileId: pid, deletedAt: null }, select: { id: true } }));
  return true;
}

/** GET /api/saves?kind=A,B&space=&ref=&text=&cursor=&limit= (`ref` / `text` look up one thing's saved item). */
export async function getSavesHandler(request: Request): Promise<Response> {
  const pid = await profileId();
  if (!pid) return NEED_PROFILE();
  const q = new URL(request.url).searchParams;
  const kinds = (q.get("kind") ?? "").split(",").filter(Boolean);
  if (kinds.some((k) => !(KINDS as readonly string[]).includes(k))) return fail(400, "Unknown type.");
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(q.get("limit") ?? "", 10) || 50));
    return Response.json(await listSaved(pid, { kind: kinds.length ? (kinds as SavedKind[]) : undefined, spaceId: q.get("space") || undefined, refId: q.get("ref") || undefined, text: q.get("text")?.slice(0, 3000) || undefined, cursor: q.get("cursor") || undefined, limit }));
  } catch (err) {
    return fromError(err);
  }
}

/** POST /api/saves `{kind, refId?, snapshot, spaceIds?}` -> 201 `{item}`. Saving the same thing again returns the same item. */
export async function postSaveHandler(request: Request, deps: SavesDeps = {}): Promise<Response> {
  return write(request, deps, SaveBody, "Send a type, what to save, and optionally spaces.", async (pid, body) => {
    if (!(await ownsTarget(pid, body.kind, body.refId))) return fail(404, "That wasn't found.");
    const item = await saveItem(pid, body);
    return Response.json({ item }, { status: 201 });
  });
}

/** PATCH /api/saves/:id `{spaceIds}` replaces the spaces the item is in. */
export async function patchSaveHandler(request: Request, { params }: Ctx, deps: SavesDeps = {}): Promise<Response> {
  const id = (await params).id;
  return write(request, deps, z.object({ spaceIds: z.array(z.string().max(64)).max(50) }), "Send the spaces this belongs in.", async (pid, body) =>
    Response.json({ item: await setItemSpaces(pid, id, body.spaceIds) }),
  );
}

/** DELETE /api/saves/:id unsaves everywhere. */
export async function deleteSaveHandler(_request: Request, { params }: Ctx, deps: SavesDeps = {}): Promise<Response> {
  const pid = await profileId();
  if (!pid) return NEED_PROFILE();
  const gate = limited(deps, pid);
  if (gate) return gate;
  try {
    await unsaveItem(pid, (await params).id);
    return Response.json({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

export async function getSpacesHandler(): Promise<Response> {
  const pid = await profileId();
  if (!pid) return NEED_PROFILE();
  return Response.json({ spaces: await listSpaces(pid) });
}

const SpaceFields = { name: z.string().max(200), description: z.string().max(2000).nullable().optional() };

/** POST /api/spaces `{name, description?}` -> 201 `{space}`. */
export async function postSpaceHandler(request: Request, deps: SavesDeps = {}): Promise<Response> {
  return write(request, deps, z.object({ ...SpaceFields, description: z.string().max(2000).optional() }), "Send a name.", async (pid, body) =>
    Response.json({ space: await createSpace(pid, body) }, { status: 201 }),
  );
}

/** PATCH /api/spaces/:id `{name?, description?, pinned?}`. */
export async function patchSpaceHandler(request: Request, { params }: Ctx, deps: SavesDeps = {}): Promise<Response> {
  const id = (await params).id;
  const schema = z.object({ name: SpaceFields.name.optional(), description: SpaceFields.description, pinned: z.boolean().optional() });
  return write(request, deps, schema, "Send a name, description or pinned.", async (pid, body) => Response.json({ space: await updateSpace(pid, id, body) }));
}

/** DELETE /api/spaces/:id: the items stay in All saves. */
export async function deleteSpaceHandler(_request: Request, { params }: Ctx, deps: SavesDeps = {}): Promise<Response> {
  const pid = await profileId();
  if (!pid) return NEED_PROFILE();
  const gate = limited(deps, pid);
  if (gate) return gate;
  try {
    await deleteSpace(pid, (await params).id);
    return Response.json({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

/** PUT /api/spaces/:id/order `{itemIds}`. */
export async function putSpaceOrderHandler(request: Request, { params }: Ctx, deps: SavesDeps = {}): Promise<Response> {
  const id = (await params).id;
  return write(request, deps, z.object({ itemIds: z.array(z.string().max(64)).max(500) }), "Send the item ids in order.", async (pid, body) => {
    await reorderSpaceItems(pid, id, body.itemIds);
    return Response.json({ ok: true });
  });
}
