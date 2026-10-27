import { after, NextResponse } from "next/server";
import { AI_PAUSED_MESSAGE, bindUsage, createAiClient, type AiClient, type AiFeature } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { isMockMode } from "@/lib/chat-deps";
import { createJob, isAiBlocked, ownerOfProfile, runJob, type JobKind } from "@brandloop/db";

export const AI_UNAVAILABLE_MESSAGE = "AI isn't set up yet. Add OPENAI_API_KEY to enable this.";

export function aiUnavailableResponse() {
  return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
}

/** Returns a 503 response when no API key is configured, otherwise null. Call before creating a job. */
export function requireAi(): NextResponse | null {
  return process.env.OPENAI_API_KEY || isMockMode() ? null : aiUnavailableResponse();
}

/** `requireAi`, plus: a 403 with the paused message when an admin paused AI for the profile's owner. Await it before creating a job. */
export async function requireAiFor(profileId: string, userId?: string): Promise<NextResponse | null> {
  const unavailable = requireAi();
  if (unavailable) return unavailable;
  const owner = userId ?? (await ownerOfProfile(profileId))?.userId;
  return owner && (await isAiBlocked(owner)) ? NextResponse.json({ error: AI_PAUSED_MESSAGE, code: "ai_paused" }, { status: 403 }) : null;
}

const JOB_FEATURE: Record<JobKind, AiFeature> = {
  MEMORY_IMPORT: "memory-learning",
  KNOWLEDGE_INGEST: "other",
  STRATEGY_GENERATE: "strategy",
  VOICE_EXTRACT: "style-extract",
  STYLE_EXTRACT: "style-extract",
};

/** Creates a job and runs `work` after the response is sent. */
export async function startJob(
  kind: JobKind,
  profileId: string,
  input: unknown,
  work: (ai: AiClient) => Promise<unknown>,
): Promise<{ jobId: string }> {
  const job = await createJob(profileId, kind, input);
  // Offline mode (AI_MOCK_MODEL=1, never in production) runs the scripted client, so e2e jobs spend no tokens.
  after(() => runJob(job.id, () => work(bindUsage(isMockMode() ? scriptedAi() : createAiClient(), { profileId, feature: JOB_FEATURE[kind] }))));
  return { jobId: job.id };
}
