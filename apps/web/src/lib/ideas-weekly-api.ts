import { AI_PAUSED_MESSAGE, createUsageLimiter, defaultCounterStore, type AiClient, type UsageLimiter } from "@brandloop/ai";
import { getChat, getIdea, getOrCreateChat, deleteChat, hasWeeklyBatch, isAiBlocked, listIdeaWeeks, markIdeaDrafted, prisma, setIdeaHidden } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ACCOUNT_CACHE_TAG, getAccount } from "@/lib/account";
import { isMockMode } from "@/lib/chat-deps";
import { generateWeeklyIdeas, weeklyIdeasClient } from "@/lib/ideas/weekly";
import { weekStartOn } from "@/lib/ideas/week";
import { revalidateTag } from "next/cache";

const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });
const NEED_PROFILE = () => fail(400, "Create a profile first.");

export const ON_DEMAND_PER_DAY = 2;
export const GEN_DAY_CHANGES_PER_WEEK = 3;
export const GEN_DAY_LIMIT_MESSAGE = "You can change this again next week.";

let limiter: UsageLimiter | null = null;
const usage = () => (limiter ??= createUsageLimiter({ store: defaultCounterStore() }));
/** Tests: a limiter on an injected store. */
export function setIdeasWeeklyLimiterForTest(l: UsageLimiter | null) {
  limiter = l;
}

type Deps = { ai?: AiClient; now?: () => Date };

/** GET /api/ideas/weekly: the last 8 weeks of stored ideas, this week's start and the profile's generation day. */
export async function getWeeklyHandler(deps: Deps = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const now = deps.now?.() ?? new Date();
  const [weeks, row] = await Promise.all([
    listIdeaWeeks(profile.id, { weeks: 8 }),
    prisma.profile.findUnique({ where: { id: profile.id }, select: { generationDayOfWeek: true, timezone: true } }),
  ]);
  return Response.json({
    weekStartOn: weekStartOn(now, row?.timezone ?? "UTC"),
    generationDayOfWeek: row?.generationDayOfWeek ?? 1,
    weeks,
  });
}

/** POST /api/ideas/weekly: makes this week's batch when it is missing (409 otherwise); two a day per profile. */
export async function postWeeklyHandler(deps: Deps = {}): Promise<Response> {
  const account = await getAccount();
  const profile = account?.currentProfile;
  if (!profile) return NEED_PROFILE();
  if (account.user?.id && (await isAiBlocked(account.user.id))) return fail(403, AI_PAUSED_MESSAGE);
  const now = deps.now?.() ?? new Date();
  const week = weekStartOn(now, profile.timezone ?? "UTC");
  if (await hasWeeklyBatch(profile.id, week)) return fail(409, "This week's ideas are already made.");

  // The offline mock costs nothing, and e2e runs share one in-memory counter for a whole server session: no daily limit there.
  const gate = isMockMode() ? ({ ok: true } as const) : await usage().takeDaily("ideas-weekly", profile.id, ON_DEMAND_PER_DAY);
  if (!gate.ok) return fail(429, "You've made ideas twice today. Try again tomorrow.", { "retry-after": String(gate.retryAfterSec) });

  const out = await generateWeeklyIdeas(profile.id, { ai: deps.ai ?? weeklyIdeasClient, now: () => now });
  if (out === "failed") return fail(502, "This week's ideas didn't arrive. Try again.");
  if (out === "exists") return fail(409, "This week's ideas are already made.");
  return getWeeklyHandler(deps);
}

const Patch = z.object({ hidden: z.boolean() });

/** PATCH /api/ideas/:id `{hidden}`. Another profile's idea is 404. */
export async function patchIdeaHandler(request: Request, id: string): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const body = Patch.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send { hidden: true | false }.");
  if (!(await setIdeaHidden(profile.id, id, body.data.hidden))) return fail(404, "Idea not found.");
  return Response.json({ id, hidden: body.data.hidden });
}

/**
 * POST /api/ideas/:id/draft: gives the idea its chat (once; a second click returns the same one) and marks it drafted.
 * The chat page opens it with the idea's prompt, which the writer turns into a draft straight away.
 */
export async function draftIdeaHandler(id: string): Promise<Response> {
  const account = await getAccount();
  const profile = account?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const idea = await getIdea(profile.id, id);
  if (!idea) return fail(404, "Idea not found.");
  if (idea.chatId && (await getChat(profile.id, idea.chatId))) return Response.json({ chatId: idea.chatId, created: false });

  const chatId = randomUUID();
  await getOrCreateChat(profile.id, account.user.id, chatId);
  const won = await markIdeaDrafted(profile.id, id, chatId);
  if (won) return Response.json({ chatId, created: true });
  // A parallel click got there first: drop our empty chat and hand back theirs.
  await deleteChat(profile.id, chatId).catch(() => {});
  const winner = await getIdea(profile.id, id);
  return Response.json({ chatId: winner?.chatId ?? chatId, created: false });
}

const Day = z.object({ day: z.number().int().min(1).max(7) });
const DAY_KEY = (profileId: string) => `genday:${profileId}`;

/** PATCH /api/profile/generation-day `{day}`: 1 = Monday … 7 = Sunday; changed at most 3 times in 7 days. */
export async function patchGenerationDayHandler(request: Request, deps: { store?: ReturnType<typeof defaultCounterStore> } = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const body = Day.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Choose a day from Monday to Sunday.");
  const current = await prisma.profile.findUnique({ where: { id: profile.id }, select: { generationDayOfWeek: true } });
  if (current?.generationDayOfWeek === body.data.day) return Response.json({ day: body.data.day });
  const store = deps.store ?? defaultCounterStore();
  const used = await store.incr(DAY_KEY(profile.id), 1, 7 * 86_400).catch(() => 0);
  if (used > GEN_DAY_CHANGES_PER_WEEK) return fail(429, GEN_DAY_LIMIT_MESSAGE);
  await prisma.profile.update({ where: { id: profile.id }, data: { generationDayOfWeek: body.data.day } });
  revalidateTag(ACCOUNT_CACHE_TAG, { expire: 0 });
  return Response.json({ day: body.data.day });
}
