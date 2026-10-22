import { after } from "next/server";
import { createJobDriver, type EnqueueOptions, type JobContext, type JobDriver } from "@brandloop/jobs";
import { getVisualDeps } from "@/lib/visuals/deps";
import { handleVisualJob } from "@/lib/visuals/handle-visual-job";

export type Topic = "visual.generate" | "visual.edit" | "visual.logo";

const g = globalThis as unknown as { __jobDriver?: JobDriver };

/** After the response when there is a request scope (so a serverless function stays alive for it), else a timer. */
function defer(run: () => Promise<void>) {
  try {
    after(run);
  } catch {
    setTimeout(() => void run(), 0);
  }
}

const visualJob = (op: "generate" | "edit" | "logo") => (payload: { visualId: string }, ctx: JobContext) =>
  handleVisualJob(getVisualDeps(), { visualId: payload.visualId, op }, ctx);

function driver(): JobDriver {
  return (g.__jobDriver ??= createJobDriver(process.env, {
    defer,
    retryDelayMs: Number.isFinite(Number(process.env.JOBS_RETRY_DELAY_MS)) && process.env.JOBS_RETRY_DELAY_MS ? Number(process.env.JOBS_RETRY_DELAY_MS) : 2_000,
    // Payloads are ids; log the message only.
    onError: (err, { topic }) => console.error(`[jobs] ${topic} failed: ${err.message}`),
    handlers: { "visual.generate": visualJob("generate"), "visual.edit": visualJob("edit"), "visual.logo": visualJob("logo") },
  }));
}

/** Queues a background job. Payloads carry ids only: handlers re-load rows and check the profile themselves. */
export function enqueue(topic: Topic, payload: { visualId: string }, opts?: EnqueueOptions): Promise<void> {
  return driver().enqueue(topic, payload, opts);
}

/** Tests: resolves when every queued job (and retry) has finished. */
export function idleJobs(): Promise<void> {
  return driver().idle();
}

/** Tests: forget the driver so the next enqueue re-reads env. */
export function resetJobsForTest(): void {
  g.__jobDriver = undefined;
}
