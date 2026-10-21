import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { frameData } from "../data";
import { stampEnvelope, type HandoffEnvelope, type PostWriting } from "../specialists/envelope";
import { buildGrounding, renderGrounding } from "../specialists/grounding";
import { runSpecialist } from "../specialists/run";
import { capOutput } from "./cap";
import { isAbort } from "./run";

/** Skills the post writer always gets (design §11). */
export const WRITING_SKILLS = ["post-formats", "hooks"];

export const REQUEST_MIN = 40;
export const REQUEST_MAX = 4_000;

/**
 * Runs the writing specialist and returns its stamped envelope, or a `Failed:` string. The envelope is
 * kept in `ctx.handoffs` under this tool call's id, so `createDocument` can take the draft from it.
 */
export async function delegateWritingRun(
  ctx: TurnContext,
  input: { request: string },
  toolCallId: string,
): Promise<HandoffEnvelope<PostWriting> | string> {
  try {
    const grounding = await buildGrounding({
      profileId: ctx.profileId,
      request: input.request,
      knowledgeIds: ctx.selections.knowledgeIds,
      writingStyleId: ctx.selections.writingStyleId,
      embedder: ctx.embedder,
    });
    const doc = ctx.documentRef.current;
    const res = await runSpecialist(ctx.ai, "post-writing", {
      request: input.request,
      grounding: renderGrounding(grounding),
      document: doc,
      skills: WRITING_SKILLS,
    });
    if (!res.ok) {
      return `Failed: the writing specialist couldn't produce a usable draft (${res.reason}). Ask the user to rephrase or try again.`;
    }
    const envelope = stampEnvelope("post-writing", res.output, {
      toolCallId,
      taskId: ctx.taskId,
      request: input.request,
      document: doc ? { id: doc.id, version: doc.version } : null,
      now: ctx.now(),
    });
    ctx.handoffs.set(toolCallId, envelope);
    return envelope;
  } catch (err) {
    if (isAbort(err)) throw err;
    console.error(`[agent] tool delegateWriting failed: ${err instanceof Error ? err.message : String(err)}`);
    return "Failed: something went wrong running delegateWriting.";
  }
}

/** What the orchestrator sees: status strings as they are, envelopes framed as the specialist's data. */
export function specialistModelOutput(output: unknown): { type: "text"; value: string } {
  if (typeof output === "string") return { type: "text", value: output };
  return { type: "text", value: capOutput(frameData("writing specialist", JSON.stringify(output, null, 2))) };
}

export function delegateTools(ctx: TurnContext) {
  return {
    delegateWriting: tool({
      description:
        "Ask the writing specialist to draft a new LinkedIn post. Write a clear brief in `request`: the topic, the angle, the audience, the format if the user named one, and any facts from memory or the knowledge base the post should use. Returns a handoff; then call createDocument with this call's id. Never retype the draft yourself.",
      inputSchema: z.object({
        request: z.string().min(REQUEST_MIN).max(REQUEST_MAX),
        specialty: z.enum(["post"]),
      }),
      execute: ({ request }, { toolCallId }) => delegateWritingRun(ctx, { request }, toolCallId),
      toModelOutput: ({ output }) => specialistModelOutput(output),
    }),
  };
}
