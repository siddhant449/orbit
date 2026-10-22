import {
  completeGenerate, failVisual, getDocument, getTheme, requeueOp, startOp, type Visual,
} from "@brandloop/db";
import { TransientJobError, type JobContext } from "@brandloop/jobs";
import { buildVisualPrompt, cropToAspect, ProviderError, sizeFor, type ImageInput } from "@brandloop/visuals";
import { storeFile } from "@/lib/storage";
import type { VisualDeps } from "./deps";

export type VisualOp = "generate" | "edit" | "logo";
export type VisualJobOutcome = "ok" | "ignored" | "failed";

const COPY = {
  refused: "This image request was declined. Try a different description.",
  unavailable: "Image generation is unavailable right now. Your credit was returned.",
  timeout: "That took too long, so we stopped. Your credit was returned.",
} as const;

export function failureCopy(err: ProviderError): string {
  if (err.code === "refused") return COPY.refused;
  if (err.code === "timeout") return COPY.timeout;
  return COPY.unavailable;
}

/** Whatever went wrong becomes a ProviderError; infrastructure errors (storage, network) count as retryable. */
export function toProviderError(err: unknown, log: (m: string) => void): ProviderError {
  if (err instanceof ProviderError) return err;
  log(`[visuals] job step failed: ${err instanceof Error ? err.name : "unknown error"}`);
  return new ProviderError("unavailable", true);
}

/** Runs `fn` with an AbortSignal that fires after the deadline. */
export async function withDeadline<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fn(ac.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function generate(deps: VisualDeps, visual: Visual): Promise<void> {
  const post = visual.documentId ? await getDocument(visual.profileId, visual.documentId) : null;
  const theme = visual.useBrandColours ? await getTheme(visual.profileId) : null;
  const reference: ImageInput | null = visual.referenceId ? await deps.loadReference(visual.profileId, visual.referenceId) : null;

  const builtPrompt = buildVisualPrompt({
    type: visual.type,
    postText: post?.text ?? "",
    userPrompt: visual.userPrompt,
    customInstructions: visual.customInstructions,
    theme: theme
      ? { background: theme.background, accent: theme.accent, headline: theme.headline, bodyText: theme.bodyText, caption: theme.caption, line: theme.line, bar: theme.bar, highlightBar: theme.highlightBar }
      : null,
    aspect: visual.aspect,
    hasReference: Boolean(reference),
  });
  const size = sizeFor(visual.aspect);
  const { image } = await withDeadline(deps.timeoutMs, (abortSignal) =>
    deps.provider.generate({ prompt: builtPrompt, size: size.provider, quality: deps.quality, references: reference ? [reference] : undefined, abortSignal }),
  );
  const cropped = await cropToAspect(image.bytes, visual.aspect);
  const stored = await storeFile(visual.profileId, visual.teamId, "VISUAL", cropped.bytes, "image/png");
  const done = await completeGenerate(visual.id, {
    storageObjectId: stored.id,
    width: cropped.width,
    height: cropped.height,
    provider: deps.provider.id,
    builtPrompt,
  });
  if (!done) throw new ProviderError("bad_output", false); // vanished mid-flight: nothing to record against
}

/**
 * The job behind `visual.generate`/`visual.edit`/`visual.logo`. Re-loads the visual by id (the payload is trusted for
 * nothing else), claims it with a compare-and-set, and either completes it, hands it back for a retry
 * (TransientJobError) or fails it and refunds in one transaction.
 */
export async function handleVisualJob(
  deps: VisualDeps,
  job: { visualId: string; op: VisualOp },
  ctx: JobContext,
): Promise<VisualJobOutcome> {
  if (job.op !== "generate" && job.op !== "edit" && job.op !== "logo") return "ignored";
  const visual = await startOp(job.visualId, job.op);
  if (!visual) return "ignored";

  try {
    if (job.op === "generate") await generate(deps, visual);
    else throw new ProviderError("bad_output", false); // edit and logo land with V4
    return "ok";
  } catch (raw) {
    const err = toProviderError(raw, deps.log);
    if (err.retryable && ctx.attempt < ctx.maxAttempts) {
      await requeueOp(visual.id);
      throw new TransientJobError(err.message);
    }
    if (err.code === "verification_required") deps.log("[visuals] image provider needs organisation verification; generation is refused until it is verified");
    await failVisual(visual.id, failureCopy(err), { refund: true });
    return "failed";
  }
}

