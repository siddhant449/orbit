import { CONTENT_TYPES, ContentTypeSchema, FORMATS, FormatSchema, type Strategy } from "@brandloop/ai";
import { z } from "zod";

/**
 * "Ideas for this week" (screens.md B11, ROADMAP §5): N post ideas generated on demand from the profile's strategy,
 * memory and recent drafts. Nothing is stored yet (see the Ideas report, "Backend needed"). This module is shared by
 * the page (client) and the route; the prompt and the model call live in `ideas-generate.ts` (server only).
 */

export const IdeaSchema = z.object({
  title: z.string(),
  angle: z.string(),
  hook: z.string(),
  format: FormatSchema,
  contentType: ContentTypeSchema,
  why: z.string(),
});
export type Idea = z.infer<typeof IdeaSchema>;

/**
 * What the model is asked for: enums arrive as strings so one bad value can't fail the whole batch; `parseIdeas`
 * validates each idea on its own.
 */
export const IdeasWireSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      hook: z.string(),
      format: z.string().describe(`One of: ${Object.keys(FORMATS).join(", ")}`),
      contentType: z.string().describe(`One of: ${Object.keys(CONTENT_TYPES).join(", ")}`),
      why: z.string(),
    }),
  ),
});

export const IdeasBasisSchema = z.object({ strategy: z.boolean(), memoryFiles: z.number(), recentDrafts: z.number() });
export type IdeasBasis = z.infer<typeof IdeasBasisSchema>;
export const IdeasResponseSchema = z.object({
  weekOf: z.string(),
  generatedAt: z.string(),
  ideas: z.array(IdeaSchema.extend({ id: z.string() })),
  basis: IdeasBasisSchema,
});
export type IdeasResponse = z.infer<typeof IdeasResponseSchema>;

/** A previously shown idea the next generation should not repeat (sent back by the page, sizes capped). */
export type PreviousIdea = { title: string; hook: string };

export const IDEA_COUNT = { min: 3, max: 8, default: 5 } as const;

export type IdeasContext = {
  strategy: Strategy | null;
  memoryIndex: string;
  coreMemory: string;
  recentDrafts: { title: string; text: string }[];
  previous: PreviousIdea[];
  /** Monday of the current week, YYYY-MM-DD, in the profile's time zone. */
  weekOf: string;
};

export function clampIdeaCount(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : IDEA_COUNT.default;
  return Math.min(IDEA_COUNT.max, Math.max(IDEA_COUNT.min, n));
}

const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** The Monday (YYYY-MM-DD) of the week `now` falls in, in `timeZone` (UTC when the zone is unknown). */
export function weekOf(now: Date, timeZone: string): string {
  const opts = { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" } as const;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).formatToParts(now);
  }
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const local = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  const monday = new Date(local - (DAY_INDEX[get("weekday")] ?? 0) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** Validates each raw idea on its own (case-normalised enums, trimmed text); invalid ones are dropped, not fatal. */
export function parseIdeas(raw: unknown[]): Idea[] {
  const out: Idea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const parsed = IdeaSchema.safeParse({
      title: text(r.title),
      angle: text(r.angle),
      hook: text(r.hook),
      format: text(r.format).toLowerCase(),
      contentType: text(r.contentType).toLowerCase().replace(/[\s-]+/g, "_"),
      why: text(r.why),
    });
    if (parsed.success && parsed.data.title && parsed.data.hook) out.push(parsed.data);
  }
  return out;
}

const STOP = new Set(
  "a an the and or of to for in on at by with from your my our their its is are be this that how why what when".split(" "),
);
const SYNONYMS: Record<string, string> = { vs: "versus", v: "versus" };

function titleTokens(title: string): Set<string> {
  const words = title.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.map((w) => SYNONYMS[w] ?? w).filter((w) => !STOP.has(w)));
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared) >= 0.6;
}

const opener = (hook: string) => (hook.toLowerCase().match(/[\p{L}\p{N}']+/u)?.[0] ?? "").replace(/'.*$/, "");

/**
 * The variety pass: drops an idea whose title is a near-duplicate (token Jaccard ≥ 0.6) of an earlier one or of a
 * previously shown idea, or whose hook opens with the same word as an earlier hook in this batch. First one wins.
 */
export function dedupeIdeas(ideas: Idea[], previous: PreviousIdea[] = []): Idea[] {
  const seenTitles = previous.map((p) => titleTokens(p.title));
  const seenOpeners = new Set<string>();
  const out: Idea[] = [];
  for (const idea of ideas) {
    const tokens = titleTokens(idea.title);
    const first = opener(idea.hook);
    if (seenTitles.some((t) => similar(t, tokens))) continue;
    if (first && seenOpeners.has(first)) continue;
    seenTitles.push(tokens);
    if (first) seenOpeners.add(first);
    out.push(idea);
  }
  return out;
}

/** The chat prompt "Draft this" opens the composer with. */
export function ideaDraftPrompt(idea: Idea): string {
  return [
    `Draft a LinkedIn post from this idea: ${idea.title}.`,
    `Angle: ${idea.angle}`,
    `Open with: ${idea.hook}`,
    `Format: ${FORMATS[idea.format].label.toLowerCase()}, ${CONTENT_TYPES[idea.contentType].label.toLowerCase()} post.`,
  ].join("\n");
}

/** Ruling A22: home reads `?prompt=` (at most 2000 code points) into a prefilled composer; it is never auto-sent. */
export const MAX_PROMPT_PARAM = 2000;

export function ideaDraftHref(idea: Idea): string {
  const prompt = [...ideaDraftPrompt(idea)].slice(0, MAX_PROMPT_PARAM).join("");
  return `/?prompt=${encodeURIComponent(prompt)}`;
}

/** The page's per-tab cache, validated: anything malformed is ignored. */
export function parseCachedIdeas(raw: string | null): IdeasResponse | null {
  if (!raw) return null;
  try {
    const parsed = IdeasResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const PREVIOUS_MAX = 8;
/** Per-field budget in JSON-encoded UTF-8 bytes: 8 × (2 fields × 100 + keys) keeps the request under 2 KB. */
const PREVIOUS_FIELD_BYTES = 100;
const utf8 = new TextEncoder();

function fitField(text: string): string {
  const points = [...text];
  let out = "";
  for (const p of points) {
    const next = out + p;
    if (utf8.encode(JSON.stringify(next)).length > PREVIOUS_FIELD_BYTES) break;
    out = next;
  }
  return out;
}

/** The ideas on screen, as the next generation's `previous` (what to avoid repeating). */
export function previousFrom(ideas: Idea[]): PreviousIdea[] {
  return ideas.slice(0, PREVIOUS_MAX).map((i) => ({ title: fitField(i.title), hook: fitField(i.hook) }));
}
