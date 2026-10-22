import {
  attachCarousel,
  CarouselConflict,
  CarouselNotFound,
  createCarousel,
  deleteCarousel,
  getCarousel,
  listCarousels,
  saveCarousel,
  setCarouselPdf,
} from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { readCappedJson } from "@/lib/chat-request";
import { storeFile } from "@/lib/storage";
import { ASPECTS, BODY_MAX, MAX_SLIDES, TEMPLATES, TITLE_MAX } from "@/lib/carousel/state";

/** Handlers behind /api/carousels. Profile-scoped; errors are `{error}`, plus `code` and `revision` on a 409. */

type Ctx = { params: Promise<{ id: string }> };

export const CAROUSEL_BODY_MAX = 64_000;
export const CAROUSEL_PDF_MAX = 12 * 1024 * 1024;

const fail = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });

async function profile(): Promise<{ profileId: string; teamId: string } | null> {
  const account = await getAccount();
  return account?.currentProfile ? { profileId: account.currentProfile.id, teamId: account.currentProfile.teamId } : null;
}

const Content = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  template: z.enum(TEMPLATES),
  aspect: z.enum(ASPECTS),
  options: z.object({ kit: z.enum(["orbit", "personal"]), logo: z.boolean() }),
  slides: z
    .array(z.object({ id: z.string().min(1).max(64), title: z.string().max(TITLE_MAX * 2), body: z.string().max(BODY_MAX * 2) }))
    .max(MAX_SLIDES),
});
const CreateBody = Content.extend({ documentId: z.string().min(1).max(64).nullish() });
const PatchBody = Content.extend({ expectedRevision: z.number().int().min(1) });
const AttachBody = z.object({ documentId: z.string().min(1).max(64).nullable() });

async function body<T extends z.ZodType>(request: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  const raw = await readCappedJson(request, CAROUSEL_BODY_MAX);
  if (!raw.ok) return { ok: false, res: raw.tooLarge ? fail(413, "That carousel is too large.") : fail(400, "Send a JSON body.") };
  const parsed = schema.safeParse(raw.value);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, res: fail(400, "That carousel isn't valid.") };
}

const publicCarousel = (c: NonNullable<Awaited<ReturnType<typeof getCarousel>>>) => ({
  id: c.id,
  documentId: c.documentId,
  title: c.title,
  template: c.template,
  aspect: c.aspect,
  options: c.options,
  slides: c.slides,
  version: c.version,
  revision: c.revision,
  pdfUrl: c.pdfUrl,
  updatedAt: c.updatedAt.toISOString(),
});

function fromError(err: unknown): Response {
  if (err instanceof CarouselConflict) {
    return fail(409, "This carousel changed since you opened it. Reload it and try again.", { code: "carousel_conflict", revision: err.currentRevision });
  }
  if (err instanceof CarouselNotFound) return fail(404, "Carousel not found.");
  throw err;
}

export async function listHandler(): Promise<Response> {
  const p = await profile();
  if (!p) return fail(400, "Create a profile first.");
  const rows = await listCarousels(p.profileId);
  return Response.json({ carousels: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) });
}

export async function createHandler(request: Request): Promise<Response> {
  const p = await profile();
  if (!p) return fail(400, "Create a profile first.");
  const b = await body(request, CreateBody);
  if (!b.ok) return b.res;
  try {
    return Response.json(publicCarousel(await createCarousel(p.profileId, b.data)), { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

export async function getHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const p = await profile();
  if (!p) return fail(400, "Create a profile first.");
  const c = await getCarousel(p.profileId, (await params).id);
  return c ? Response.json(publicCarousel(c)) : fail(404, "Carousel not found.");
}

export async function patchHandler(request: Request, { params }: Ctx): Promise<Response> {
  const p = await profile();
  if (!p) return fail(400, "Create a profile first.");
  const raw = await readCappedJson(request, CAROUSEL_BODY_MAX);
  // An attach request carries only documentId.
  if (raw.ok && raw.value && typeof raw.value === "object" && "documentId" in raw.value && !("slides" in raw.value)) {
    const a = AttachBody.safeParse(raw.value);
    if (!a.success) return fail(400, "That isn't valid.");
    try {
      return Response.json(publicCarousel(await attachCarousel(p.profileId, (await params).id, a.data.documentId)));
    } catch (err) {
      return fromError(err);
    }
  }
  if (!raw.ok) return raw.tooLarge ? fail(413, "That carousel is too large.") : fail(400, "Send a JSON body.");
  const parsed = PatchBody.safeParse(raw.value);
  if (!parsed.success) return fail(400, "That carousel isn't valid.");
  const { expectedRevision, ...content } = parsed.data;
  try {
    return Response.json(publicCarousel(await saveCarousel(p.profileId, (await params).id, content, expectedRevision)));
  } catch (err) {
    return fromError(err);
  }
}

export async function deleteHandler(_request: Request, { params }: Ctx): Promise<Response> {
  const p = await profile();
  if (!p) return fail(400, "Create a profile first.");
  return (await deleteCarousel(p.profileId, (await params).id)) ? new Response(null, { status: 204 }) : fail(404, "Carousel not found.");
}

/** POST /api/carousels/:id/pdf: the raw PDF as the body (application/pdf). Stored public under an unguessable key. */
export async function pdfHandler(request: Request, { params }: Ctx): Promise<Response> {
  const p = await profile();
  if (!p) return fail(400, "Create a profile first.");
  const id = (await params).id;
  if (!(await getCarousel(p.profileId, id))) return fail(404, "Carousel not found.");
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "Upload size is required.");
  if (declared > CAROUSEL_PDF_MAX) return fail(413, "That PDF is too large.");
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > CAROUSEL_PDF_MAX) return fail(413, "That PDF is too large.");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return fail(415, "That isn't a PDF.");
  const file = await storeFile(p.profileId, p.teamId, "CAROUSEL_PDF", bytes, "application/pdf");
  try {
    await setCarouselPdf(p.profileId, id, file.id, file.url);
  } catch (err) {
    return fromError(err);
  }
  return Response.json({ pdfUrl: file.url });
}
