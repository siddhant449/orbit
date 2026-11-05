import { aiErrorUserMessage, bindUsage, createAiClient, type AiClient } from "@brandloop/ai";
import { CONTENT_TYPES } from "@brandloop/ai/constants";
import { scriptedAi } from "@brandloop/agent";
import { createNotification, hasWeeklyBatch, isAiBlocked, prisma, saveIdeaBatch, type IdeaInput } from "@brandloop/db";
import { isMockMode } from "@/lib/chat-deps";
import { ideaDraftPrompt } from "@/lib/ideas";
import { assignIdeaSources, loadIdeasContext } from "@/lib/ideas-api";
import { generateIdeas } from "@/lib/ideas-generate";
import { weekStartOn } from "./week";

export const WEEKLY_IDEA_COUNT = 5;
export type WeeklyResult = "created" | "exists" | "failed";

/** The client the weekly batch runs on: the scripted one in mock mode, else OpenAI; every call lands on the usage ledger. */
export function weeklyIdeasClient(profile: { id: string; teamId: string; ownerUserId: string }): AiClient {
  return bindUsage(isMockMode() ? scriptedAi() : createAiClient(), { userId: profile.ownerUserId, teamId: profile.teamId, profileId: profile.id, feature: "ideas" });
}

/**
 * One batch of five ideas for the profile's current local week, stored once. A batch that already exists is left alone
 * (no model call). A failure is logged and returned; nothing retries.
 */
export async function generateWeeklyIdeas(
  profileId: string,
  deps: { ai: AiClient | ((profile: { id: string; teamId: string; ownerUserId: string }) => AiClient); now: () => Date },
): Promise<WeeklyResult> {
  try {
    const profile = await prisma.profile.findFirst({ where: { id: profileId, deletedAt: null } });
    if (!profile) return "failed";
    const now = deps.now();
    const week = weekStartOn(now, profile.timezone);
    if (await hasWeeklyBatch(profileId, week)) return "exists";
    // An admin paused AI for this account: no model call, no batch.
    if (await isAiBlocked(profile.ownerUserId)) return "failed";

    const { ctx } = await loadIdeasContext(profileId, profile.timezone, now);
    const sources = await assignIdeaSources(ctx, profileId, WEEKLY_IDEA_COUNT);
    const ai = typeof deps.ai === "function" ? deps.ai(profile) : deps.ai;
    const ideas = await generateIdeas(ai, ctx, WEEKLY_IDEA_COUNT);
    const rows: IdeaInput[] = ideas.map((idea, i) => ({
      category: CONTENT_TYPES[idea.contentType].label,
      title: idea.title,
      detail: idea.angle,
      prompt: ideaDraftPrompt(idea),
      sourceKind: sources[i]?.kind ?? "strategy",
      sourceRef: sources[i]?.ref ?? null,
    }));
    const saved = await saveIdeaBatch(profileId, week, "weekly", rows);
    if (!saved.created) return "exists";
    await createNotification(profileId, { kind: "IDEAS_READY", title: "This week's ideas are ready", href: "/ideas", dedupeKey: `ideas:${week}` });
    return "created";
  } catch (err) {
    const cause = err instanceof Error && "cause" in err && err.cause ? err.cause : err;
    console.error(`[ideas] weekly generation failed for ${profileId}: ${aiErrorUserMessage(cause) ?? (err instanceof Error ? err.message : "unknown error")}`);
    return "failed";
  }
}
