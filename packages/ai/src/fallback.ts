import type { LanguageModel } from "ai";
import { classifyAiError, isProviderDown, retryDelayMs } from "./errors";
import { geminiEnabled, getGeminiModel, resolveGeminiModel, type GeminiAlias } from "./gemini";
import { recordFallbackSuccess, reportProviderError } from "./provider-alert";

type Model = Exclude<LanguageModel, string>;
type V4 = Extract<Model, { specificationVersion: "v4" }>;

/** Marks a result as produced by the fallback model; `fallbackModelOf` reads it back for the usage ledger. */
export const FALLBACK_META_KEY = "orbit";
export const fallbackModelOf = (providerMetadata: unknown): string | undefined => {
  const m = (providerMetadata as Record<string, { fallbackModel?: unknown } | undefined> | undefined)?.[FALLBACK_META_KEY]?.fallbackModel;
  return typeof m === "string" ? m : undefined;
};
/** Waits before each retry of the fallback after a transient failure (overloaded or busy). */
export const FALLBACK_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];
/** The longest we honour a fallback's "retry after" (Gemini's free tier asks for up to a minute; chat routes run up to 300 s). */
export const FALLBACK_MAX_WAIT_MS = 40_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

const tag = (meta: unknown, model: string) => ({ ...(meta as object | undefined), [FALLBACK_META_KEY]: { fallbackModel: model } }) as never;

/**
 * A language model that is `primary` until it fails with a provider-down error (quota, auth, outage), then ONE attempt on
 * `fallback` for that same call (with a couple of short retries if the fallback is briefly overloaded). Rate limits and everything else pass through (the SDK's own retries handle a rate limit).
 * Streams fall back only when the primary fails before producing any output; a failure after output keeps the primary's error.
 * If the fallback also fails, the primary's error is thrown, so callers show the same friendly message either way.
 * The SDK retries around this model, so a retryable primary failure never reaches a retry: it is answered by the fallback.
 */
export function withFallback(primary: V4, fallback: () => V4 | null, { retryDelaysMs = FALLBACK_RETRY_DELAYS_MS, maxWaitMs = FALLBACK_MAX_WAIT_MS }: { retryDelaysMs?: readonly number[]; maxWaitMs?: number } = {}): V4 {
  const shouldFall = (err: unknown) => isProviderDown(classifyAiError(err));
  async function viaFallback<T>(primaryErr: unknown, signal: AbortSignal | undefined, run: (m: V4) => PromiseLike<T>): Promise<{ out: T; model: string }> {
    reportProviderError(primaryErr, `${primary.modelId} failed, trying the fallback`);
    const fb = fallback();
    if (!fb) throw primaryErr;
    // The fallback is often briefly overloaded (503) or busy (429): a couple of short retries before giving up.
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await run(fb);
        recordFallbackSuccess();
        return { out, model: fb.modelId };
      } catch (fbErr) {
        const cls = classifyAiError(fbErr);
        const base = retryDelaysMs[attempt];
        if ((cls === "outage" || cls === "rate_limit") && base !== undefined && !signal?.aborted) {
          // A busy fallback says how long to wait (Gemini's free tier: 5 requests a minute); honour it up to a cap.
          const asked = cls === "rate_limit" ? retryDelayMs(fbErr) : undefined;
          await sleep(asked !== undefined ? Math.min(Math.max(asked, base), maxWaitMs) : base, signal);
          if (!signal?.aborted) continue;
        }
        reportProviderError(fbErr, `fallback ${fb.modelId} failed`);
        throw primaryErr;
      }
    }
  }
  return {
    specificationVersion: "v4",
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    async doGenerate(options) {
      try {
        return await primary.doGenerate(options);
      } catch (err) {
        if (!shouldFall(err) || options.abortSignal?.aborted) throw err;
        const { out, model } = await viaFallback(err, options.abortSignal, (m) => m.doGenerate(options));
        return { ...out, providerMetadata: tag(out.providerMetadata, model) };
      }
    },
    async doStream(options) {
      const toFallback = async (err: unknown) => {
        const { out, model } = await viaFallback(err, options.abortSignal, (m) => m.doStream(options));
        return {
          ...out,
          stream: out.stream.pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                controller.enqueue(chunk.type === "finish" ? { ...chunk, providerMetadata: tag(chunk.providerMetadata, model) } : chunk);
              },
            }),
          ),
        };
      };
      let result;
      try {
        result = await primary.doStream(options);
      } catch (err) {
        if (!shouldFall(err) || options.abortSignal?.aborted) throw err;
        return toFallback(err);
      }
      // Peek until the first real output: an error part before it is still "before any output".
      const reader = result.stream.getReader();
      const held: Awaited<ReturnType<typeof reader.read>>["value"][] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.type === "error" && shouldFall(value.error) && !options.abortSignal?.aborted) {
          void reader.cancel().catch(() => {});
          return toFallback(value.error);
        }
        held.push(value);
        if (value && value.type !== "stream-start" && value.type !== "response-metadata") break;
      }
      const stream = new ReadableStream({
        start(controller) {
          for (const c of held) controller.enqueue(c);
        },
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) controller.close();
          else controller.enqueue(value);
        },
        cancel: (reason) => reader.cancel(reason),
      });
      return { ...result, stream } as typeof result;
    },
  };
}

/** Wraps `primary` with the Gemini fallback for `alias` when GEMINI_API_KEY is set; otherwise returns it unchanged. */
export function withGeminiFallback(primary: LanguageModel, alias: GeminiAlias, env: Record<string, string | undefined> = process.env): LanguageModel {
  if (typeof primary === "string" || primary.specificationVersion !== "v4" || !geminiEnabled(env)) return primary;
  return withFallback(primary, () => {
    const m = getGeminiModel(alias, env);
    return m && typeof m !== "string" && m.specificationVersion === "v4" ? m : null;
  });
}

export { resolveGeminiModel };
