import { AiUnavailableError, createAiClient, StrategySchema, type AiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { getStrategy, listMemory, prisma, renderCoreSections, renderMemoryIndex } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { isMockMode } from "@/lib/chat-deps";
import { clampIdeaCount, generateIdeas, weekOf, type Idea, type IdeasContext } from "@/lib/ideas";
import { AI_UNAVAILABLE_MESSAGE } from "@/lib/run-job";

export type IdeasBasis = { strategy: boolean; memoryFiles: number; recentPosts: number };
export type IdeasResponse = { weekOf: string; generatedAt: string; ideas: (Idea & { id: string })[]; basis: IdeasBasis };

const RECENT_POSTS = 6;

/** The profile's strategy, memory and latest posts, as the ideas prompt reads them. */
export async function loadIdeasContext(profileId: string, timeZone: string, now: Date): Promise<{ ctx: IdeasContext; basis: IdeasBasis }> {
  const [row, memory, docs] = await Promise.all([
    getStrategy(profileId),
    listMemory(profileId),
    prisma.document.findMany({
      where: { profileId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: RECENT_POSTS,
      select: { title: true, versions: { orderBy: { version: "desc" }, take: 1, select: { text: true } } },
    }),
  ]);
  const parsed = row ? StrategySchema.safeParse(row) : null;
  const recentPosts = docs.flatMap((d) => (d.versions[0] ? [{ title: d.title, text: d.versions[0].text }] : []));
  return {
    ctx: {
      strategy: parsed?.success ? parsed.data : null,
      memoryIndex: renderMemoryIndex(memory),
      coreMemory: renderCoreSections(memory),
      recentPosts,
      weekOf: weekOf(now, timeZone),
    },
    basis: { strategy: Boolean(parsed?.success), memoryFiles: memory.length, recentPosts: recentPosts.length },
  };
}

const fail = (status: number, error: string) => Response.json({ error }, { status });
const Body = z.object({ count: z.number().optional() }).catch({});

export type IdeasDeps = { ai?: AiClient; now?: () => Date };

/** POST /api/ideas `{count?}`: generates this week's ideas on demand. Nothing is stored. */
export async function postIdeasHandler(request: Request, deps: IdeasDeps = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(400, "Create a profile first.");

  let ai = deps.ai;
  if (!ai) {
    if (isMockMode()) ai = scriptedAi();
    else if (!process.env.OPENAI_API_KEY) return fail(503, AI_UNAVAILABLE_MESSAGE);
    else ai = createAiClient();
  }

  const body = Body.parse(await request.json().catch(() => ({})));
  const count = clampIdeaCount(body.count);
  const now = deps.now?.() ?? new Date();
  const { ctx, basis } = await loadIdeasContext(profile.id, profile.timezone ?? "UTC", now);

  try {
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
    console.error(`[ideas] generation failed: ${err instanceof Error ? err.message : String(err)}`);
    // Our own clear errors ("The model declined…", "…cut off…", "…no ideas") are safe to show; anything else stays generic.
    const message = err instanceof Error && err.message.startsWith("The model") ? err.message : "Couldn't generate ideas. Try again.";
    return fail(502, message);
  }
}
