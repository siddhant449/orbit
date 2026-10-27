import { after } from "next/server";
import { createJobDriver, type EnqueueOptions, type JobContext, type JobDriver } from "@brandloop/jobs";
import { bindUsage, createAiClient } from "@brandloop/ai";
import { LEARN_DELAY_MS, noteDocumentEdit, runStyleLearn, scriptedAi } from "@brandloop/agent";
import { isMockMode } from "@/lib/chat-deps";
import { getVisualDeps } from "@/lib/visuals/deps";
import { handleVisualJob } from "@/lib/visuals/handle-visual-job";

export type Topic = "visual.generate" | "visual.edit" | "visual.logo" | "style.learn-from-edit";
type Payload = { visualId: string } | { profileId: string; documentId: string; token?: string };

/** The newest pending style-learning token per post: a newer save supersedes an older queued job (trailing debounce). */
const pendingLearn = new Map<string, string>();

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
    handlers: {
      "style.learn-from-edit": async (payload: { profileId: string; documentId: string; token: string }) => {
        if (pendingLearn.get(payload.documentId) !== payload.token) return;
        pendingLearn.delete(payload.documentId);
        await runStyleLearn(bindUsage(isMockMode() ? scriptedAi() : createAiClient(), { profileId: payload.profileId, feature: "style-learning" }), payload);
      },
      "visual.generate": visualJob("generate"), "visual.edit": visualJob("edit"), "visual.logo": visualJob("logo"),
    },
  }));
}

/** Queues a background job. Payloads carry ids only: handlers re-load rows and check the profile themselves. */
export function enqueue(topic: Topic, payload: Payload, opts?: EnqueueOptions): Promise<void> {
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

/**
 * After a USER_EDIT save: records the edit ratio on the post's template use and, for a real edit (ratio >= 5%), queues
 * ONE style-learning job per post per 5-minute window, run 90 s later so it sees the settled text. Never throws; does nothing when no AI is configured.
 */
export async function afterUserEdit(profileId: string, documentId: string): Promise<void> {
  try {
    const note = await noteDocumentEdit(profileId, documentId);
    if (!note?.enqueue || !(process.env.OPENAI_API_KEY || isMockMode())) return;
    const delay = Number(process.env.STYLE_LEARN_DELAY_MS ?? LEARN_DELAY_MS);
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    pendingLearn.set(documentId, token);
    if (pendingLearn.size > 1_000) pendingLearn.delete(pendingLearn.keys().next().value!);
    await enqueue("style.learn-from-edit", { profileId, documentId, token }, {
      notBefore: new Date(Date.now() + (Number.isFinite(delay) ? delay : LEARN_DELAY_MS)),
    });
  } catch (err) {
    console.error(`[jobs] style learning not queued: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}
