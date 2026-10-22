import { z } from "zod";

/**
 * Typed browser client for the image routes (design F5 §5). The editor's "Add a visual" dialog, the image block and the
 * /images library call these instead of `fetch`. Responses are parsed with zod, so a route that drifts fails loudly here.
 * Every function takes an optional `fetch` so it can be tested without a server.
 */

export type VisualAspect = "SQUARE" | "PORTRAIT_4_5" | "PORTRAIT_2_3" | "LANDSCAPE_3_2";
export type VisualType = "INFOGRAPHIC" | "BEFORE_AFTER" | "QUOTE" | "GENERAL";

export const POLL_INTERVAL_MS = 3_000;
/** After this long the dialog stops waiting and tells the person it will keep working in their library. */
export const POLL_GIVE_UP_MS = 4 * 60_000;

const Visual = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]),
  imageUrl: z.string().nullable(),
  currentVersion: z.number(),
  editCount: z.number(),
  maxEdits: z.number(),
  remainingEdits: z.number(),
  error: z.string().nullable(),
  aspect: z.enum(["SQUARE", "PORTRAIT_4_5", "PORTRAIT_2_3", "LANDSCAPE_3_2"]),
  type: z.enum(["INFOGRAPHIC", "BEFORE_AFTER", "QUOTE", "GENERAL"]),
  altText: z.string().nullable(),
  documentId: z.string().nullable(),
  activeOp: z.string().nullable(),
  createdAt: z.string(),
});
export type VisualDto = z.infer<typeof Visual>;

const LibraryItem = Visual.extend({ documentTitle: z.string().nullable() });
export type LibraryItemDto = z.infer<typeof LibraryItem>;

const Credits = z.object({ balance: z.number(), monthlyAllocation: z.number(), periodStartedAt: z.string(), refillsAt: z.string(), hasAddon: z.boolean() });
export type CreditsDto = z.infer<typeof Credits>;

const Colours = z.object({
  background: z.string(), accent: z.string(), headline: z.string(), bodyText: z.string(),
  caption: z.string(), line: z.string(), bar: z.string(), highlightBar: z.string(),
});
export type ThemeColoursDto = z.infer<typeof Colours>;
const ThemeState = z.object({ theme: Colours, decision: z.enum(["NONE", "CONFIRMED", "SKIPPED"]), source: z.string(), logoUrl: z.string().nullable() });
export type ThemeStateDto = z.infer<typeof ThemeState>;

const Version = z.object({ version: z.number(), kind: z.enum(["GENERATED", "EDIT", "LOGO", "REVERT"]), imageUrl: z.string().nullable(), editPrompt: z.string().nullable(), createdAt: z.string() });
export type VersionDto = z.infer<typeof Version>;

const Reference = z.object({ id: z.string(), title: z.string(), tags: z.array(z.string()), width: z.number(), height: z.number(), createdAt: z.string(), url: z.string() });
export type ReferenceDto = z.infer<typeof Reference>;

/** An error the person can be told about, with the route's `code` (e.g. `out_of_credits`, `refused`, `edit_limit`). */
export class VisualsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null,
    /** The rest of the error body: `balance`/`refillsAt` for out_of_credits, `proposal` for needs_brand_confirmation, `category` for refused. */
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VisualsApiError";
  }
}

export type Fetch = typeof fetch;

async function call<T>(f: Fetch, path: string, schema: z.ZodType<T> | null, init: RequestInit = {}): Promise<T> {
  const res = await f(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const { error, code, ...rest } = body;
    throw new VisualsApiError(res.status, typeof error === "string" ? error : "Something went wrong.", typeof code === "string" ? code : null, rest);
  }
  if (!schema) return undefined as T;
  return schema.parse(await res.json());
}

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

export type CreateVisualInput = {
  documentId?: string;
  prompt: string;
  visualType: VisualType;
  aspect?: VisualAspect;
  useBrandColours?: boolean;
  customInstructions?: string;
  referenceId?: string;
  /** Reuse the same id when retrying so a retry never spends a second credit. */
  requestId?: string;
};

export async function createVisual(input: CreateVisualInput, f: Fetch = fetch): Promise<{ visual: VisualDto; balance: number }> {
  const { documentId, requestId, ...rest } = input;
  return call(f, "/api/visuals", z.object({ visual: Visual, balance: z.number() }), json("POST", {
    ...rest, source: documentId ? "post" : "library", documentId, requestId: requestId ?? crypto.randomUUID(),
  }));
}

export const getVisual = (id: string, f: Fetch = fetch) => call(f, `/api/visuals/${id}`, Visual);

const ActiveResponse = z.object({ active: z.boolean(), isEdit: z.boolean(), visual: Visual.nullable(), sourceImageUrl: z.string().nullable().optional() });
/** Resume a running operation when the editor mounts. */
export const getActiveVisual = (documentId: string, f: Fetch = fetch) => call(f, `/api/visuals/active?documentId=${encodeURIComponent(documentId)}`, ActiveResponse);

export async function listVisuals(opts: { cursor?: string; documentId?: string; limit?: number } = {}, f: Fetch = fetch) {
  const q = new URLSearchParams();
  if (opts.cursor) q.set("cursor", opts.cursor);
  if (opts.documentId) q.set("documentId", opts.documentId);
  if (opts.limit) q.set("limit", String(opts.limit));
  return call(f, `/api/visuals${q.size ? `?${q}` : ""}`, z.object({ items: z.array(LibraryItem), nextCursor: z.string().nullable() }));
}

export const getCredits = (f: Fetch = fetch) => call(f, "/api/credits", Credits);

export const editVisual = (id: string, prompt: string, f: Fetch = fetch) =>
  call(f, `/api/visuals/${id}/edit`, Visual, json("POST", { prompt, requestId: crypto.randomUUID() }));

export const listVersions = async (id: string, f: Fetch = fetch) => (await call(f, `/api/visuals/${id}/versions`, z.object({ versions: z.array(Version) }))).versions;

export const revertVisual = (id: string, version: number, f: Fetch = fetch) => call(f, `/api/visuals/${id}/revert`, Visual, json("POST", { version }));

export const addLogo = (id: string, placement: { x?: number; y?: number; sizePercent?: number } = {}, f: Fetch = fetch) =>
  call(f, `/api/visuals/${id}/logo`, Visual, json("POST", placement));

export const setAltText = (id: string, altText: string | null, f: Fetch = fetch) => call(f, `/api/visuals/${id}`, Visual, json("PATCH", { altText }));

export const deleteVisual = (id: string, f: Fetch = fetch) => call<void>(f, `/api/visuals/${id}`, null, { method: "DELETE" });

const Media = z.object({ media: z.object({ id: z.string(), documentId: z.string(), visualId: z.string().nullable(), position: z.number(), altText: z.string().nullable(), frozen: z.boolean() }) });
export const attachVisual = (id: string, documentId: string, f: Fetch = fetch) => call(f, `/api/visuals/${id}/attach`, Media, json("POST", { documentId }));
export const detachVisual = (id: string, documentId: string, f: Fetch = fetch) =>
  call<void>(f, `/api/visuals/${id}/attach?documentId=${encodeURIComponent(documentId)}`, null, { method: "DELETE" });

/**
 * Polls a visual until it finishes (COMPLETED or FAILED), every `POLL_INTERVAL_MS`, giving up after `POLL_GIVE_UP_MS`
 * (it returns the last state with `timedOut: true`; the job keeps going and the image lands in the library).
 */
export async function pollVisual(
  id: string,
  opts: { f?: Fetch; intervalMs?: number; giveUpMs?: number; onUpdate?: (v: VisualDto) => void; signal?: AbortSignal; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ visual: VisualDto; timedOut: boolean }> {
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  const giveUp = opts.giveUpMs ?? POLL_GIVE_UP_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = Date.now();
  for (;;) {
    const visual = await getVisual(id, opts.f);
    opts.onUpdate?.(visual);
    if (visual.status === "COMPLETED" || visual.status === "FAILED") return { visual, timedOut: false };
    if (opts.signal?.aborted) return { visual, timedOut: false };
    if (Date.now() - started >= giveUp) return { visual, timedOut: true };
    await sleep(interval);
  }
}

// ---- brand theme, logo, references

export const getTheme = (f: Fetch = fetch) => call(f, "/api/brand-theme", ThemeState);
export const saveTheme = (theme: ThemeColoursDto, f: Fetch = fetch) => call(f, "/api/brand-theme", ThemeState, json("PUT", { theme }));
export const resetTheme = (f: Fetch = fetch) => call(f, "/api/brand-theme", ThemeState, json("DELETE"));
export const decideTheme = (accept: boolean, proposal: ThemeColoursDto | undefined, f: Fetch = fetch) =>
  call(f, "/api/brand-theme/decision", ThemeState, json("POST", { accept, proposal }));

function formWith(file: File, fields: Record<string, string> = {}): RequestInit {
  const body = new FormData();
  body.set("file", file);
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return { method: "POST", body };
}
export const extractTheme = async (file: File, f: Fetch = fetch) => (await call(f, "/api/brand-theme/extract", z.object({ theme: Colours }), formWith(file))).theme;
export const uploadLogo = (file: File, f: Fetch = fetch) => call(f, "/api/brand-theme/logo", ThemeState, formWith(file));
export const removeLogo = (f: Fetch = fetch) => call(f, "/api/brand-theme/logo", ThemeState, { method: "DELETE" });

export const listReferences = async (opts: { tag?: string; q?: string } = {}, f: Fetch = fetch) => {
  const q = new URLSearchParams();
  if (opts.tag) q.set("tag", opts.tag);
  if (opts.q) q.set("q", opts.q);
  return (await call(f, `/api/reference-images${q.size ? `?${q}` : ""}`, z.object({ items: z.array(Reference) }))).items;
};
export const uploadReference = async (file: File, title: string, tags: string[], f: Fetch = fetch) =>
  (await call(f, "/api/reference-images", z.object({ item: Reference }), formWith(file, { title, tags: tags.join(",") }))).item;
export const deleteReference = (id: string, f: Fetch = fetch) => call<void>(f, `/api/reference-images/${id}`, null, { method: "DELETE" });
export const listReferenceTags = async (f: Fetch = fetch) => (await call(f, "/api/reference-images/tags", z.object({ tags: z.array(z.string()) }))).tags;

const PostMediaList = z.object({
  media: z.array(z.object({
    id: z.string(), documentId: z.string(), visualId: z.string().nullable(), position: z.number(), altText: z.string().nullable(), frozen: z.boolean(),
    url: z.string().nullable(), width: z.number().nullable(), height: z.number().nullable(), contentType: z.string().nullable(),
  })),
});
/** What is attached to a post, in order (what the editor shows after a reload). */
export const listPostMedia = async (documentId: string, f: Fetch = fetch) => (await call(f, `/api/documents/${documentId}/media`, PostMediaList)).media;
