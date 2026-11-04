import { AI_PAUSED_MESSAGE, aiErrorUserMessage, AiUnavailableError, bindUsage, createAiClient, type AiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { CATEGORIES } from "@brandloop/agent/client";
import {
  createTemplate,
  deleteTemplate,
  getDocument,
  getTemplateBySlug,
  isAiBlocked,
  listTemplates,
  prisma,
  setTemplateLiked,
  setTemplateSaved,
  TemplateError,
  updateTemplate,
} from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { isMockMode } from "@/lib/chat-deps";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { AI_UNAVAILABLE_MESSAGE } from "@/lib/run-job";
import { suggestTemplateFromPost, TemplateFromPostError } from "@/lib/templates/from-post";

const int = (v: string | null, d: number, max: number) => Math.min(max, Math.max(0, Number.parseInt(v ?? "", 10) || d));
const NEED_PROFILE = () => Response.json({ error: "Create a profile first." }, { status: 400 });

/**
 * The template library: the shipped templates and this profile's own, filtered by type and category, searched, paged.
 * `saved=1` lists only the ones this profile saved; every row says whether it is saved.
 */
export async function getTemplatesHandler(request: Request): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const q = new URL(request.url).searchParams;
  const type = q.get("type");
  const { items, total } = await listTemplates({
    type: type === "HOOK" || type === "POST" ? type : undefined,
    category: q.get("category") || undefined,
    search: q.get("search")?.slice(0, 100) || undefined,
    savedBy: q.get("saved") === "1" ? profile.id : undefined,
    ownerProfileId: profile.id,
    offset: int(q.get("offset"), 0, 100_000),
    sort: q.get("sort") === "popular" || q.get("sort") === "newest" ? (q.get("sort") as "popular" | "newest") : undefined,
    limit: Math.max(1, int(q.get("limit"), 50, 100)),
  });
  return Response.json({
    total,
    items: items.map((t) => ({
      id: t.id,
      slug: t.slug,
      type: t.type,
      category: t.category,
      title: t.title,
      why: t.why,
      skeleton: t.skeleton,
      beats: t.beats,
      needs: t.needs,
      tags: t.tags,
      saved: t.saved,
      liked: t.liked,
      own: t.own,
      likeCount: t.likeCount,
      useCount: t.useCount,
    })),
  });
}

/** Saves (`saved: true`) or unsaves a template for this profile. Another profile's own template is not found. */
export async function setSavedHandler(id: string, saved: boolean): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const row = await prisma.template.findUnique({ where: { id }, select: { id: true, system: true, profileId: true } });
  if (!row || !(row.system || row.profileId === profile.id)) return Response.json({ error: "Template not found." }, { status: 404 });
  await setTemplateSaved(profile.id, row.id, saved);
  return Response.json({ id: row.id, saved });
}

/** A template by slug, if this profile may see it. */
export async function ownTemplateBySlug(profileId: string, slug: string) {
  const t = await getTemplateBySlug(slug).catch(() => null);
  return t && (t.system || t.profileId === profileId) ? t : null;
}

const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });
const TEMPLATE_BODY_MAX_BYTES = 12 * 1024;
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const TemplateBody = z.object({
  title: z.string().max(200),
  type: z.enum(["HOOK", "POST"]),
  category: z.string().max(60).refine((c) => CATEGORY_IDS.includes(c), "Choose a category from the list."),
  skeleton: z.string().max(6000),
  why: z.string().max(1000).nullable().optional(),
});
const TemplatePatch = TemplateBody.partial();

async function readJson(request: Request): Promise<unknown | undefined> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > TEMPLATE_BODY_MAX_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fromTemplateError(err: unknown): Response {
  if (err instanceof TemplateError) return err.code === "not_found" ? fail(404, "Template not found.") : fail(400, err.message);
  throw err;
}

async function profileOr400() {
  const profile = (await getAccount())?.currentProfile;
  return profile ?? null;
}

type Ctx = { params: Promise<{ id: string }> };
const dto = (t: Awaited<ReturnType<typeof createTemplate>>) => ({
  id: t.id,
  slug: t.slug,
  type: t.type,
  category: t.category,
  title: t.title,
  why: t.why,
  skeleton: t.skeleton,
  beats: t.beats,
  needs: t.needs,
  tags: t.tags,
  saved: false,
  liked: false,
  own: true,
  likeCount: t.likeCount,
  useCount: t.useCount,
});

/** POST /api/templates: a template of the profile's own. The skeleton needs a `[slot]`. */
export async function postTemplateHandler(request: Request): Promise<Response> {
  const profile = await profileOr400();
  if (!profile) return NEED_PROFILE();
  const body = TemplateBody.safeParse(await readJson(request));
  if (!body.success) return fail(400, body.error.issues[0]?.message ?? "Send a name, type, category and text.");
  try {
    return Response.json({ template: dto(await createTemplate(profile.id, body.data)) }, { status: 201 });
  } catch (err) {
    return fromTemplateError(err);
  }
}

/** PATCH /api/templates/:id: edit an own template. */
export async function patchTemplateHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await profileOr400();
  if (!profile) return NEED_PROFILE();
  const body = TemplatePatch.safeParse(await readJson(request));
  if (!body.success) return fail(400, body.error.issues[0]?.message ?? "Send the fields to change.");
  try {
    return Response.json({ template: dto(await updateTemplate(profile.id, (await params).id, body.data)) });
  } catch (err) {
    return fromTemplateError(err);
  }
}

/** DELETE /api/templates/:id: delete an own template. */
export async function deleteTemplateHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = await profileOr400();
  if (!profile) return NEED_PROFILE();
  try {
    await deleteTemplate(profile.id, (await params).id);
    return Response.json({ ok: true });
  } catch (err) {
    return fromTemplateError(err);
  }
}

/** POST / DELETE /api/templates/:id/like. */
export async function setLikedHandler(id: string, liked: boolean): Promise<Response> {
  const profile = await profileOr400();
  if (!profile) return NEED_PROFILE();
  try {
    return Response.json({ id, ...(await setTemplateLiked(profile.id, id, liked)) });
  } catch (err) {
    return fromTemplateError(err);
  }
}

// 10 suggestions per profile per hour; survives dev hot reloads.
const globalLimiter = globalThis as unknown as { __fromPostLimiter?: RateLimiter };
const fromPostLimiter = () => (globalLimiter.__fromPostLimiter ??= createRateLimiter({ limit: 10, windowMs: 60 * 60_000 }));
export type FromPostDeps = { ai?: AiClient; limiter?: RateLimiter };

/** POST /api/templates/from-post `{documentId}`: one Luna call that suggests a template. Nothing is saved. */
export async function fromPostHandler(request: Request, deps: FromPostDeps = {}): Promise<Response> {
  const account = await getAccount();
  const profile = account?.currentProfile;
  if (!profile) return NEED_PROFILE();
  if (account.user?.id && (await isAiBlocked(account.user.id))) return fail(403, AI_PAUSED_MESSAGE);
  const body = z.object({ documentId: z.string().min(1).max(64) }).safeParse(await readJson(request));
  if (!body.success) return fail(400, "Send the post to turn into a template.");
  const doc = await getDocument(profile.id, body.data.documentId);
  if (!doc) return fail(404, "Post not found.");
  const gate = (deps.limiter ?? fromPostLimiter()).take(profile.id);
  if (!gate.ok) {
    return fail(429, "You've made several templates from posts in the last hour. Try again later.", { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) });
  }
  try {
    const ai = bindUsage(deps.ai ?? (isMockMode() ? scriptedAi() : createAiClient()), { userId: account.user?.id, profileId: profile.id, feature: "template-from-post" });
    return Response.json({ suggestion: await suggestTemplateFromPost(ai, doc.text, request.signal) });
  } catch (err) {
    if (err instanceof AiUnavailableError) return fail(503, AI_UNAVAILABLE_MESSAGE);
    const down = aiErrorUserMessage(err instanceof TemplateFromPostError ? err.cause : err);
    if (down) return fail(503, down);
    if (err instanceof TemplateFromPostError) {
      console.error(`[templates] from-post failed: ${err.cause instanceof Error ? err.cause.message : err.message}`);
      return fail(502, err.message);
    }
    throw err;
  }
}
