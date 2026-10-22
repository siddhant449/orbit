import { beginEdit, getTheme, getVisual, listVersions, revertVisual, VisualError } from "@brandloop/db";
import { LOGO_DEFAULT } from "@brandloop/visuals";
import { z } from "zod";
import { enqueue } from "@/lib/jobs";
import { currentProfile, fail, notFound, visualJson } from "./handlers";
import { startVisualEdit } from "./start-edit";

type Ctx = { params: Promise<{ id: string }> };

/** Maps the service's errors to the route contract (design F5 §5). */
function fromError(err: unknown): Response {
  if (err instanceof VisualError) {
    switch (err.code) {
      case "not_found": return notFound();
      case "in_progress": return fail(409, "This image is busy. Try again in a moment.", { code: "visual_in_progress" });
      case "edit_limit": return fail(409, "This image has used all of its edits.", { code: "edit_limit" });
      case "invalid": return fail(422, err.message === "invalid" ? "That can't be done to this image." : err.message, { code: "invalid" });
    }
  }
  throw err;
}

async function reply(profileId: string, id: string, status = 200): Promise<Response> {
  const found = await getVisual(profileId, id);
  return found ? Response.json(visualJson(found.visual, found.current), { status }) : notFound();
}

const Edit = z.object({ prompt: z.string().trim().min(1).max(1_000), requestId: z.string().min(8).max(64) });

/** POST /api/visuals/:id/edit {prompt, requestId}: free while editCount < maxEdits; the safety check comes first. */
export async function editHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const parsed = Edit.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return fail(400, "Describe the change you want.");
  const id = (await params).id;
  const started = await startVisualEdit(profile.id, id, parsed.data.prompt, parsed.data.requestId);
  if (!started.ok) {
    if (started.status === 404) return notFound();
    const message = started.message.charAt(0).toUpperCase() + started.message.slice(1);
    return fail(started.status, message, { code: started.code, ...(started.category ? { category: started.category } : {}) });
  }
  return reply(profile.id, id, 202);
}

/** GET /api/visuals/:id/versions. */
export async function versionsHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const id = (await params).id;
  if (!(await getVisual(profile.id, id))) return notFound();
  const versions = await listVersions(profile.id, id);
  return Response.json({
    versions: versions.map((v) => ({
      version: v.version,
      kind: v.kind,
      imageUrl: v.storageObject.url,
      editPrompt: v.editPrompt,
      createdAt: v.createdAt.toISOString(),
    })),
  });
}

const Revert = z.object({ version: z.number().int().min(0) });

/** POST /api/visuals/:id/revert {version}: a new REVERT version pointing at the same file. Free and uncapped. */
export async function revertHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const parsed = Revert.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return fail(400, "Choose a version to go back to.");
  const id = (await params).id;
  try {
    await revertVisual(profile.id, id, parsed.data.version);
  } catch (err) {
    return fromError(err);
  }
  return reply(profile.id, id);
}

const Logo = z.object({
  x: z.number().min(0).max(100).default(LOGO_DEFAULT.x),
  y: z.number().min(0).max(100).default(LOGO_DEFAULT.y),
  sizePercent: z.number().min(1).max(100).default(LOGO_DEFAULT.sizePercent),
});

/** POST /api/visuals/:id/logo {x, y, sizePercent}: needs the theme logo; counts as an edit and takes the op lock. */
export async function logoHandler(request: Request, { params }: Ctx): Promise<Response> {
  const profile = await currentProfile();
  if (!profile) return notFound();
  const text = await request.text();
  const raw = text.trim() ? await Promise.resolve().then(() => JSON.parse(text) as unknown).catch(() => undefined) : {};
  const parsed = Logo.safeParse(raw);
  if (!parsed.success) return fail(400, "That logo position isn't valid.");
  const id = (await params).id;
  if (!(await getVisual(profile.id, id))) return notFound();
  if (!(await getTheme(profile.id)).logoObjectId) return fail(409, "Add your logo in the brand theme first.", { code: "no_logo" });
  try {
    await beginEdit(profile.id, id, "logo", parsed.data);
  } catch (err) {
    return fromError(err);
  }
  await enqueue("visual.logo", { visualId: id }, { dedupeId: `visual:${id}:logo:${Date.now()}` });
  return reply(profile.id, id, 202);
}
