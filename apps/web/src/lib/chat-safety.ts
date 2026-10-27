import {
  CHAT_LIMITS,
  chatDailyCapMicroUsd,
  createModerator,
  createUsageLimiter,
  defaultCounterStore,
  estimateCostMicroUsd,
  type Moderate,
} from "@brandloop/ai";
import type { ChatSafety } from "@brandloop/agent";
import { effectiveDailyCapMicroUsd, getAiControls } from "@brandloop/db";

const envInt = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Offline moderation for dev and e2e: flags only the literal marker, so tests can exercise the refusal path. */
export const mockModerate: Moderate = async (text) =>
  /\bmoderation-test-flag\b/i.test(text) ? { flagged: true, categories: ["harassment"] } : { flagged: false, categories: [] };

/**
 * Chat safety for one request: OpenAI moderation (or the offline stand-in), a per-profile turn limit
 * (CHAT_RATE_LIMIT_TURNS per 10 minutes, default 20) and a daily cost cap (CHAT_DAILY_COST_USD, default $3, or the user's own cap set by an admin).
 * Counters live in Upstash Redis when its REST variables are set, else in memory.
 */
export function createChatSafety({ mock, limiter = createUsageLimiter({ store: defaultCounterStore() }) }: { mock: boolean; limiter?: ReturnType<typeof createUsageLimiter> }): ChatSafety {
  const turns = envInt("CHAT_RATE_LIMIT_TURNS", mock ? 1000 : CHAT_LIMITS.turns);
  return {
    moderate: mock ? mockModerate : createModerator(),
    isBlocked: async (userId) => (await getAiControls(userId)).aiBlocked,
    async check(profileId, userId) {
      // A per-user cap set by an admin replaces the default (CHAT_DAILY_COST_USD); the running counter is still per profile.
      const controls = userId ? await getAiControls(userId) : { dailyCapMicroUsd: null };
      const budget = await limiter.checkBudget("chat", profileId, effectiveDailyCapMicroUsd(controls, chatDailyCapMicroUsd()));
      if (!budget.ok) return budget;
      return limiter.take("chat", profileId, { limit: turns, windowSec: CHAT_LIMITS.windowSec });
    },
    recordUsage: (profileId, modelId, usage) => limiter.recordCost("chat", profileId, estimateCostMicroUsd(modelId, usage)),
  };
}
