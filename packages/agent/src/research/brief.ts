import type { AiClient } from "@brandloop/ai";
import { DAILY_SEARCH_CAP, findFreshBrief, saveResearchBrief, searchesToday } from "@brandloop/db";
import { normalizeResearch, type Exclusion, type ResearchItem } from "./normalize";
import type { ResearchProvider, SearchResult } from "./provider";
import { windowWords, type ResearchWindow } from "./window";

export const PREFETCH_QUERIES = 3;
/** Real hosted searches take 11-20 s each; the three facets run in parallel, so the wall bounds the whole step (a turn is allowed 300 s). */
export const SEARCH_TIMEOUT_MS = 60_000;
export const PREFETCH_WALL_MS = 75_000;
/** Turning the answers into dated items gets its own budget, so a slow search can't starve it. */
export const NORMALIZE_TIMEOUT_MS = 30_000;
/** Start of every "research didn't happen, carry on without it" result. The steps UI shows these calmly, not as a failure. */
export const SKIPPED_PREFIX = "Skipped:";
/** Characters of the brief the writer and the orchestrator see (design §6.2). */
export const BRIEF_CHARS = { writer: 4_000, orchestrator: 2_500 } as const;
export const LIMIT_REFUSED = "Refused: today's research limit is reached.";

export type ResearchBrief = {
  window: ResearchWindow;
  topic: string;
  provider: string;
  items: ResearchItem[];
  exclusions: Exclusion[];
  searchCount: number;
  reused: boolean;
};

/** Our own freshness contract, put in every query (design §6.1). */
const contract = (w: ResearchWindow) =>
  `Only use sources published between ${windowWords(w)}. A roundup counts only for news inside that period. Give the exact publication date and the event date of each item, name the original source, and say plainly if nothing qualified.`;

/**
 * Three facet queries, built from the strategy and not from the chat's wording: official announcements on the topic,
 * the same for the user's audience and pillars, and data or reports.
 */
export function buildFacetQueries(topic: string, w: ResearchWindow, strategy: { audience: string | null; pillars: string[] }): string[] {
  const audience = strategy.audience?.trim();
  const pillars = strategy.pillars.map((p) => p.trim()).filter(Boolean).slice(0, 3).join(", ");
  const period = windowWords(w);
  return [
    `Official announcements about ${topic} during ${period}. ${contract(w)}`,
    `What changed during ${period} that matters for ${[audience, pillars].filter(Boolean).join("; ") || topic}. ${contract(w)}`,
    `New data, reports or studies about ${topic} published during ${period}. ${contract(w)}`,
  ];
}

const isTimeout = (err: unknown) => err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** What went wrong, safe for logs: the error's name, message and HTTP status. Never keys, headers or prompt text. */
export function describeFailure(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const status = (err as { statusCode?: unknown; status?: unknown }).statusCode ?? (err as { status?: unknown }).status;
  return `${err.name}: ${err.message.slice(0, 200)}${typeof status === "number" ? ` (status ${status})` : ""}`;
}

export type PrefetchDeps = {
  ai: AiClient;
  provider: ResearchProvider;
  profileId: string;
  chatId: string;
  strategy: { audience: string | null; pillars: string[] };
  signal?: AbortSignal;
  now?: () => Date;
};

/**
 * Searches in parallel (three facets, 60 s each, 75 s in all), normalises, stores the brief and returns it. A fresh brief for
 * the same chat, window and topic is reused without a search; the per-profile daily cap returns the refusal text.
 */
export async function runResearch(deps: PrefetchDeps, topic: string, window: ResearchWindow): Promise<ResearchBrief | string> {
  const now = deps.now?.() ?? new Date();
  const fresh = await findFreshBrief(deps.profileId, deps.chatId, { topic, windowStart: window.start, windowEnd: window.end }, now);
  if (fresh) {
    return { window, topic, provider: fresh.provider, items: fresh.items as ResearchItem[], exclusions: fresh.exclusions as Exclusion[], searchCount: 0, reused: true };
  }
  if ((await searchesToday(deps.profileId, now)) + PREFETCH_QUERIES > DAILY_SEARCH_CAP) return LIMIT_REFUSED;

  const wall = AbortSignal.any([AbortSignal.timeout(PREFETCH_WALL_MS), ...(deps.signal ? [deps.signal] : [])]);
  const queries = buildFacetQueries(topic, window, deps.strategy);
  const settled = await Promise.allSettled(
    queries.map((query) => deps.provider.search({ query, window, maxResults: 8 }, AbortSignal.any([AbortSignal.timeout(SEARCH_TIMEOUT_MS), wall]))),
  );
  deps.signal?.throwIfAborted();
  const raw = settled.flatMap((s): SearchResult[] => (s.status === "fulfilled" ? [s.value] : []));
  const searchCount = settled.length;
  const failures = settled.flatMap((s) => (s.status === "rejected" ? [s.reason] : []));
  for (const reason of failures) console.error(`[agent] research search failed: ${describeFailure(reason)}`);
  if (raw.length === 0) {
    await saveResearchBrief(deps.profileId, deps.chatId, { topic, windowStart: window.start, windowEnd: window.end, provider: deps.provider.id, items: [], exclusions: [], searchCount });
    const why = failures.some((f) => isTimeout(f)) ? "the web search took too long" : "the web search provider returned an error";
    return `${SKIPPED_PREFIX} ${why}, so there is no research this time. Do not stop or refuse: carry on and write anyway, with no dated or specific news claims, and say in one short line that live sources were unavailable so you avoided specific news.`;
  }
  const { items, exclusions, dropped } = await normalizeResearch(deps.ai, raw, window, AbortSignal.any([AbortSignal.timeout(NORMALIZE_TIMEOUT_MS), ...(deps.signal ? [deps.signal] : [])]));
  if (dropped > 0) console.info(`[agent] research: dropped ${dropped} item(s) whose URL the provider never returned`);
  await saveResearchBrief(deps.profileId, deps.chatId, { topic, windowStart: window.start, windowEnd: window.end, provider: deps.provider.id, items, exclusions, searchCount });
  return { window, topic, provider: deps.provider.id, items, exclusions, searchCount, reused: false };
}

const d = (ymd: string | null) => (ymd ? `${Number(ymd.slice(8, 10))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(ymd.slice(5, 7)) - 1]}` : "undated");

/** The brief as the `<research>` block of a prompt: items with ids and dates, then what was excluded, within the character budget. */
export function renderBrief(b: Pick<ResearchBrief, "window" | "items" | "exclusions">, max: number): string {
  const lines = [`Window: ${b.window.label} (${b.window.start} to ${b.window.end}). Use only these items; cite them by id. Name dates inline.`];
  for (const i of b.items) lines.push(`- ${i.id} [${d(i.eventDate ?? i.published)}] ${i.claim} (${i.publisher}, ${i.role})`);
  if (b.items.length === 0) lines.push("- No item qualified inside the window. Say so; do not state current events.");
  if (b.exclusions.length) lines.push(`Excluded: ${b.exclusions.map((e) => `${e.claim.slice(0, 80)} (${e.reason})`).join("; ")}`);
  const text = lines.join("\n");
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
