import { getStrategy, prisma } from "@brandloop/db";
import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { frameData } from "../data";
import { BRIEF_CHARS, describeFailure, renderBrief, runResearch, SKIPPED_PREFIX, type ResearchBrief } from "../research/brief";
import { defaultWindow, resolveWindow } from "../research/window";
import { capOutput } from "./cap";
import { isAbort } from "./run";

/** `researchTopic` calls the model may make in one turn (design §6.2). */
export const MAX_RESEARCH_CALLS = 2;

const WINDOW_TEXT = { today: "today", "this-week": "this week", "last-7-days": "past 7 days", "this-month": "this month" } as const;

export type ResearchOutput = { success: true; window: ResearchBrief["window"]; items: ResearchBrief["items"]; exclusions: ResearchBrief["exclusions"]; provider: string; searchCount: number; reused: boolean };

export async function researchTopicRun(
  ctx: TurnContext,
  input: { query: string; window: keyof typeof WINDOW_TEXT | null; site: string | null },
  abortSignal?: AbortSignal,
): Promise<ResearchOutput | string> {
  const provider = ctx.research.provider;
  if (!provider || !ctx.selections.webSearchEnabled) return "Refused: web search is off. Tell the user to turn it on and ask again.";
  if (ctx.research.calls >= MAX_RESEARCH_CALLS) return "Refused: that is the most research one message may use.";
  ctx.research.calls++;
  try {
    const [profile, strategy] = await Promise.all([
      prisma.profile.findUniqueOrThrow({ where: { id: ctx.profileId }, select: { timezone: true } }),
      getStrategy(ctx.profileId),
    ]);
    const now = ctx.now();
    // The user's own words decide the window (the model's wording can't widen a week into a month); then the model's choice.
    const window =
      resolveWindow(ctx.userText, now, profile.timezone) ??
      (input.window ? resolveWindow(WINDOW_TEXT[input.window], now, profile.timezone) : null) ??
      resolveWindow(input.query, now, profile.timezone) ??
      defaultWindow(now, profile.timezone);
    const series = Array.isArray(strategy?.recurringSeries) ? (strategy!.recurringSeries as { name?: string; title?: string }[]).map((s) => s.name ?? s.title ?? "") : [];
    const topic = input.site ? `${input.query} (site:${input.site.replace(/[^\w.-]/g, "")})` : input.query;
    const brief = await runResearch(
      { ai: ctx.ai, provider, profileId: ctx.profileId, chatId: ctx.chatId, strategy: { audience: strategy?.positioning ?? null, pillars: [strategy?.expertise ?? "", ...series].filter(Boolean) }, signal: abortSignal, now: ctx.now },
      topic,
      window,
    );
    if (typeof brief === "string") return brief;
    ctx.research.brief = brief;
    return { success: true, window: brief.window, items: brief.items, exclusions: brief.exclusions, provider: brief.provider, searchCount: brief.searchCount, reused: brief.reused };
  } catch (err) {
    // The user stopping the turn unwinds it; research's own time budget running out only skips the research.
    if (isAbort(err) && abortSignal?.aborted) throw err;
    const timedOut = isAbort(err);
    console.error(`[agent] tool researchTopic failed: ${describeFailure(err)}`);
    return `${SKIPPED_PREFIX} research ${timedOut ? "took too long" : "hit a provider error"}, so there is none this time. Do not stop or refuse: carry on and write anyway, with no dated or specific news claims, and say in one short line that live sources were unavailable so you avoided specific news.`;
  }
}

export function researchTools(ctx: TurnContext) {
  return {
    researchTopic: tool({
      description:
        "Research current events with dated, sourced results inside a time window (the web toggle must be on). `query` is the topic in your own words. `window` is today, this-week, last-7-days or this-month (the user's own wording wins, and a week is never widened). `site` narrows a follow-up to one site. The user sees the dated items as a research step; the sources go into a post's Sources line automatically. Use it for news, announcements and \"this week\" questions, at most twice per message. Never state current events without it.",
      inputSchema: z.object({
        query: z.string().min(3).max(500),
        window: z.enum(["today", "this-week", "last-7-days", "this-month"]).nullable(),
        site: z.string().max(100).nullable(),
      }),
      execute: (input, { abortSignal }) => researchTopicRun(ctx, input, abortSignal),
      toModelOutput: ({ output }) => {
        if (typeof output === "string") return { type: "text", value: output };
        const o = output as ResearchOutput;
        return { type: "text", value: capOutput(frameData("web research", renderBrief({ window: o.window, items: o.items, exclusions: o.exclusions }, BRIEF_CHARS.orchestrator))) };
      },
    }),
  };
}
