import type { AiClient } from "./client";
import type { Embedder } from "./embed";
import type { Moderate } from "./moderation";
import { estimateCostMicroUsd } from "./usage-limits";

/**
 * The AI usage ledger's source side. Every model call in Orbit reports ONE event here (feature, model, token counts,
 * estimated cost, who). The app registers a recorder (packages/db writes a batched, fire-and-forget row to `AiUsage`);
 * without one, reporting is a no-op. Events never carry prompt or output text.
 *
 * Who: `bindUsage` / `bindEmbedder` wrap a client for one caller, so identity does not depend on async context.
 * What: the `feature` option on a call (or the binding's default).
 */
export const AI_FEATURES = [
  "chat", "writing", "editing", "polish", "review", "research", "ideas", "hooks", "title", "moderation",
  "memory-learning", "style-learning", "style-extract", "strategy", "onboarding", "images", "embeddings", "other",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export type UsageWho = { userId?: string | null; teamId?: string | null; profileId?: string | null; chatId?: string | null };
export type UsageEvent = UsageWho & {
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  ok: boolean;
};

export class AiBlockedError extends Error {
  constructor(message = AI_PAUSED_MESSAGE) {
    super(message);
    this.name = "AiBlockedError";
  }
}

/** What a user sees when an admin has paused AI for their account. */
export const AI_PAUSED_MESSAGE = "AI is paused for your account. Contact support.";

type Recorder = (event: UsageEvent) => void;
type Gate = (who: UsageWho) => Promise<void>;

// One registry per process, on globalThis: Next bundles server routes separately, so a module-level variable could
// be registered in one bundle and read from another.
const g = globalThis as unknown as { __orbitUsage?: { recorder: Recorder | null; gate: Gate | null } };
const reg = () => (g.__orbitUsage ??= { recorder: null, gate: null });

/** Registers the sink for usage events (the app's DB writer). Pass null to clear. */
export function setUsageRecorder(recorder: Recorder | null): void {
  reg().recorder = recorder;
}

/** Registers the check that runs before a bound client's model call; it throws AiBlockedError to refuse. */
export function setUsageGate(gate: Gate | null): void {
  reg().gate = gate;
}

/** Reports one call. Fire-and-forget: never throws, never waits. */
export function reportUsage(event: Omit<UsageEvent, "costMicroUsd"> & { costMicroUsd?: number }): void {
  const { recorder } = reg();
  if (!recorder) return;
  try {
    const cost = event.costMicroUsd ?? estimateCostMicroUsd(event.model, event);
    recorder({ ...event, inputTokens: Math.max(0, Math.round(event.inputTokens)), outputTokens: Math.max(0, Math.round(event.outputTokens)), costMicroUsd: Math.max(0, Math.round(cost)) });
  } catch {
    /* the ledger must never break a request */
  }
}

/** Refuses (AiBlockedError) when the registered gate says this caller's AI is paused. No gate or no identity: allowed. */
export async function assertAiAllowed(who: UsageWho): Promise<void> {
  const { gate } = reg();
  if (!gate || (!who.userId && !who.profileId)) return;
  await gate(who);
}

/** Rough token count for text (about four characters per token). For paths where the provider reports none. */
export const approxTokens = (chars: number): number => Math.ceil(chars / 4);

/**
 * An AiClient that checks the gate before every call and reports every call (including failures) to the ledger,
 * for one caller. Token counts are the provider's when the inner client reports them through `onUsage`, else an
 * estimate from the text lengths (scripted/mock clients).
 */
export function bindUsage(client: AiClient, who: UsageWho & { feature?: AiFeature }): AiClient {
  const base: AiClient = client;
  const run = async <T>(opts: { model: string; system: string; prompt: string; feature?: AiFeature | undefined }, call: (onUsage: (u: { inputTokens?: number | undefined; outputTokens?: number | undefined }) => void) => Promise<T>, outLen: (r: T) => number): Promise<T> => {
    await assertAiAllowed(who);
    const feature = opts.feature ?? who.feature ?? "other";
    let seen: { inputTokens: number; outputTokens: number } | null = null;
    const model = typeof opts.model === "string" ? opts.model : "unknown";
    const modelId = resolveAlias(model);
    try {
      const out = await call((u) => (seen = { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 }));
      const usage = seen ?? { inputTokens: approxTokens(opts.system.length + opts.prompt.length), outputTokens: approxTokens(outLen(out)) };
      reportUsage({ ...who, feature, model: modelId, ...usage, ok: true });
      return out;
    } catch (err) {
      const usage = seen ?? { inputTokens: 0, outputTokens: 0 };
      reportUsage({ ...who, feature, model: modelId, ...usage, ok: false });
      throw err;
    }
  };
  return {
    text: (opts) => run(opts, (onUsage) => base.text({ ...opts, onUsage }), (r) => r.length),
    json: (opts) => run(opts, (onUsage) => base.json({ ...opts, onUsage }), (r) => JSON.stringify(r ?? "").length),
  };
}

/** Alias ("generate"/"extract") to the model id used for pricing. Mirrors resolveModel without importing the provider. */
function resolveAlias(alias: string): string {
  if (alias === "generate") return process.env.AI_MODEL_GENERATE ?? "gpt-6-luna";
  if (alias === "extract") return process.env.AI_MODEL_EXTRACT ?? "gpt-6-luna";
  return alias;
}

/** An Embedder that checks the gate and reports each embed() as one `embeddings` event (tokens estimated from the text). */
export function bindEmbedder(embedder: Embedder, who: UsageWho, model = process.env.AI_MODEL_EMBED ?? "text-embedding-3-small"): Embedder {
  return {
    async embed(texts) {
      await assertAiAllowed(who);
      const inputTokens = approxTokens(texts.reduce((n, t) => n + t.length, 0));
      try {
        const out = await embedder.embed(texts);
        reportUsage({ ...who, feature: "embeddings", model, inputTokens, outputTokens: 0, ok: true });
        return out;
      } catch (err) {
        reportUsage({ ...who, feature: "embeddings", model, inputTokens: 0, outputTokens: 0, ok: false });
        throw err;
      }
    },
  };
}

/** Image prices in dollars per image by quality (estimate for a 1024-class image). Override with AI_IMAGE_PRICE_USD_<QUALITY>. */
const IMAGE_USD: Record<string, number> = { low: 0.011, medium: 0.042, high: 0.167 };

/** Estimated micro-USD for one generated or edited image. */
export function imageCostMicroUsd(quality: string, env: Record<string, string | undefined> = process.env): number {
  const override = Number(env[`AI_IMAGE_PRICE_USD_${quality.toUpperCase()}`]);
  const usd = Number.isFinite(override) && override > 0 ? override : (IMAGE_USD[quality] ?? IMAGE_USD.medium!);
  return Math.round(usd * 1_000_000);
}

/** A Moderate that reports each check as one `moderation` event. OpenAI's moderation endpoint is free, so the cost is 0; the row counts the calls. */
export function bindModerate(moderate: Moderate, who: UsageWho): Moderate {
  return async (text) => {
    try {
      const out = await moderate(text);
      reportUsage({ ...who, feature: "moderation", model: "omni-moderation-latest", inputTokens: approxTokens(text.length), outputTokens: 0, costMicroUsd: 0, ok: true });
      return out;
    } catch (err) {
      reportUsage({ ...who, feature: "moderation", model: "omni-moderation-latest", inputTokens: 0, outputTokens: 0, costMicroUsd: 0, ok: false });
      throw err;
    }
  };
}
