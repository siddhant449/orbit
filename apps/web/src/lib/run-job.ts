import { after, NextResponse } from "next/server";
import { createAiClient, type AiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { isMockMode } from "@/lib/chat-deps";
import { createJob, runJob, type JobKind } from "@brandloop/db";

export const AI_UNAVAILABLE_MESSAGE = "AI isn't set up yet. Add OPENAI_API_KEY to enable this.";

export function aiUnavailableResponse() {
  return NextResponse.json({ error: AI_UNAVAILABLE_MESSAGE }, { status: 503 });
}

/** Returns a 503 response when no API key is configured, otherwise null. Call before creating a job. */
export function requireAi(): NextResponse | null {
  return process.env.OPENAI_API_KEY || isMockMode() ? null : aiUnavailableResponse();
}

/** Creates a job and runs `work` after the response is sent. */
export async function startJob(
  kind: JobKind,
  profileId: string,
  input: unknown,
  work: (ai: AiClient) => Promise<unknown>,
): Promise<{ jobId: string }> {
  const job = await createJob(profileId, kind, input);
  // Offline mode (AI_MOCK_MODEL=1, never in production) runs the scripted client, so e2e jobs spend no tokens.
  after(() => runJob(job.id, () => work(isMockMode() ? scriptedAi() : createAiClient())));
  return { jobId: job.id };
}
