import { AiUnavailableError, createAiClient, StrategySchema, type AiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { getStrategy, listMemory, prisma, renderCoreSections, renderMemoryIndex } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { isMockMode } from "@/lib/chat-deps";
import { clampIdeaCount, weekOf, type IdeasBasis, type IdeasContext, type IdeasResponse, type PreviousIdea } from "@/lib/ideas";
import { generateIdeas, IdeasGenerationError } from "@/lib/ideas-generate";
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { AI_UNAVAILABLE_MESSAGE } from "@/lib/run-job";

const RECENT_DRAFTS = 6;
export const IDEAS_BODY_MAX_BYTES = 2048;

/** The profile's strategy, memory and latest drafts, as the ideas prompt reads them. */
export async function loadIdeasContext(
  profileId: string,
  timeZone: string,
  now: Date,
  previous: PreviousIdea[] = [],
): Promise<{ ctx: IdeasContext; basis: IdeasBasis }> {
  const [row, memory, docs] = await Promise.all([
    getStrategy(profileId),
    listMemory(profileId),
    prisma.document.findMany({
      where: { profileId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: RECENT_DRAFTS,
      select: { title: true, versions: { orderBy: { version: "desc" }, take: 1, select: { text: true } } },
    }),
  ]);
  const parsed = row ? StrategySchema.safeParse(row) : null;
  const recentDrafts = docs.flatMap((d) => (d.versions[0] ? [{ title: d.title, text: d.versions[0].text }] : []));
  return {
    ctx: {
      strategy: parsed?.success ? parsed.data : null,
      memoryIndex: renderMemoryIndex(memory),
      coreMemory: renderCoreSections(memory),
      recentDrafts,
      previous,
      weekOf: weekOf(now, timeZone),
    },
    basis: { strategy: Boolean(parsed?.success), memoryFiles: memory.length, recentDrafts: recentDrafts.length },
  };
}

const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });

const Body = z.object({
  count: z.number().optional(),
  previous: z
    .array(z.object({ title: z.string().max(120), hook: z.string().max(120) }))
    .max(8)
    .optional(),
});

// 6 generations per profile per 10 minutes; survives dev hot reloads.
const globalLimiter = globalThis as unknown as { __ideasLimiter?: RateLimiter };
const defaultLimiter = () => (globalLimiter.__ideasLimiter ??= createRateLimiter({ limit: 6, windowMs: 10 * 60_000 }));

export type IdeasDeps = { ai?: AiClient; now?: () => Date; limiter?: RateLimiter };

async function readBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IDEAS_BODY_MAX_BYTES) return { ok: false };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > IDEAS_BODY_MAX_BYTES) return { ok: false };
  try {
    return { ok: true, value: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: true, value: {} };
  }
}

/** POST /api/ideas `{count?, previous?}`: generates this week's ideas on demand. Nothing is stored. */
export async function postIdeasHandler(request: Request, deps: IdeasDeps = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(400, "Create a profile first.");

  const raw = await readBody(request);
  if (!raw.ok) return fail(413, "That request is too large.");
  const body = Body.safeParse(raw.value);
  if (!body.success) return fail(400, "Send a count from 3 to 8 and at most 8 previous ideas.");

  const gate = (deps.limiter ?? defaultLimiter()).take(profile.id);
  if (!gate.ok) {
    return fail(429, "You've generated ideas several times in the last few minutes. Try again shortly.", {
      "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)),
    });
  }

  const count = clampIdeaCount(body.data.count);
  const now = deps.now?.() ?? new Date();
  const { ctx, basis } = await loadIdeasContext(profile.id, profile.timezone ?? "UTC", now, body.data.previous ?? []);

  try {
    // The real client throws AiUnavailableError on first use when no key is set; mock mode never needs one.
    const ai = deps.ai ?? (isMockMode() ? scriptedAi() : createAiClient());
    const ideas = await generateIdeas(ai, ctx, count, request.signal);
    const response: IdeasResponse = {
      weekOf: ctx.weekOf,
      generatedAt: now.toISOString(),
      ideas: ideas.map((idea, i) => ({ id: `idea-${i + 1}`, ...idea })),
      basis,
    };
    return Response.json(response);
  } catch (err) {
    if (err instanceof AiUnavailableError) return fail(503, AI_UNAVAILABLE_MESSAGE);
    if (err instanceof IdeasGenerationError) {
      console.error(`[ideas] generation failed: ${err.cause instanceof Error ? err.cause.message : err.message}`);
      return fail(502, err.message);
    }
    throw err;
  }
}
