import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { frameData, type DataSource } from "../data";
import { bannedWordsFromRules, runDeterministicChecks } from "../specialists/checks";
import { stampEnvelope, type FinalReview, type HandoffEnvelope, type PostWriting } from "../specialists/envelope";
import { buildGrounding, renderGrounding } from "../specialists/grounding";
import { runSpecialist } from "../specialists/run";
import { capOutput } from "./cap";
import { currentPost, EXISTING_POST } from "./documents";
import { isAbort } from "./run";

/** Skills the post writer always gets (design §11). */
export const WRITING_SKILLS = ["post-formats", "hooks"];
/** Skills the editing specialist always gets (design §11). */
export const EDITING_SKILLS = ["proofreading"];

export const REQUEST_MIN = 40;
export const REQUEST_MAX = 4_000;

/**
 * Runs the writing specialist and returns its stamped envelope, or a `Failed:` string. The envelope is
 * kept in `ctx.handoffs` under this tool call's id, so `createDocument` can take the draft from it.
 *
 * delegateWriting only ever feeds createDocument (specialty "post", a new post). Rewrites of the open
 * post go through updateDocument, which runs its own editing call. So when the chat already has a post
 * this returns the EXISTING_POST guidance without spending a model call on a draft that couldn't be saved.
 * The abort signal (stop, turn deadline) cancels the specialist call and is rethrown, never reported.
 */
export async function delegateWritingRun(
  ctx: TurnContext,
  input: { request: string },
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<HandoffEnvelope<PostWriting> | string> {
  if (ctx.documentRef.current) return EXISTING_POST;
  try {
    const grounding = await buildGrounding({
      profileId: ctx.profileId,
      request: input.request,
      knowledgeIds: ctx.selections.knowledgeIds,
      writingStyleId: ctx.selections.writingStyleId,
      embedder: ctx.embedder,
    });
    // A new post: there is no open document (see the short-circuit above), so no source revision either.
    const res = await runSpecialist(ctx.ai, "post-writing", {
      request: input.request,
      grounding: renderGrounding(grounding),
      document: null,
      skills: WRITING_SKILLS,
      abortSignal,
    });
    if (!res.ok) {
      return `Failed: the writing specialist couldn't produce a usable draft (${res.reason}). Ask the user to rephrase or try again.`;
    }
    const envelope = stampEnvelope("post-writing", res.output, {
      toolCallId,
      taskId: ctx.taskId,
      request: input.request,
      document: null,
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

/**
 * The final review (design §6.3): the server runs the 8 deterministic checks on the current post first, tells the
 * reviewer their results, then overwrites whatever the reviewer reported for them. Any failed check fails the review.
 */
export async function delegateEditingRun(
  ctx: TurnContext,
  input: { request: string },
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<HandoffEnvelope<FinalReview> | string> {
  try {
    const doc = await currentPost(ctx);
    if (!doc) return "Failed: there's no post in this chat to review yet. Draft one first.";
    const grounding = await buildGrounding({
      profileId: ctx.profileId,
      request: input.request,
      knowledgeIds: ctx.selections.knowledgeIds,
      writingStyleId: ctx.selections.writingStyleId,
      embedder: ctx.embedder,
    });
    const checks = runDeterministicChecks(doc.text, { bannedWords: bannedWordsFromRules(grounding.writingRules) });
    const checkLines = checks.map((c) => `- ${c.id}: ${c.passed ? "passed" : "FAILED"} (${c.detail})`).join("\n");
    const res = await runSpecialist(ctx.ai, "final-review", {
      request: `${input.request}\n\nDeterministic checks, already run by the server (copy them into deterministicChecks as given):\n${checkLines}`,
      grounding: renderGrounding(grounding),
      document: doc,
      skills: EDITING_SKILLS,
      abortSignal,
    });
    if (!res.ok) return `Failed: the reviewer couldn't finish the review (${res.reason}). Ask the user to try again.`;
    const review = res.output.payload.qualityReview;
    const output = {
      ...res.output,
      payload: { qualityReview: { ...review, passed: review.passed && checks.every((c) => c.passed), deterministicChecks: checks } },
    };
    const envelope = stampEnvelope("final-review", output, {
      toolCallId,
      taskId: ctx.taskId,
      request: input.request,
      document: doc,
      now: ctx.now(),
    });
    ctx.handoffs.set(toolCallId, envelope);
    return envelope;
  } catch (err) {
    if (isAbort(err)) throw err;
    console.error(`[agent] tool delegateEditing failed: ${err instanceof Error ? err.message : String(err)}`);
    return "Failed: something went wrong running delegateEditing.";
  }
}

/** What the orchestrator sees: status strings as they are, envelopes framed as the specialist's data. */
export function specialistModelOutput(output: unknown, source: DataSource = "writing specialist"): { type: "text"; value: string } {
  if (typeof output === "string") return { type: "text", value: output };
  return { type: "text", value: capOutput(frameData(source, JSON.stringify(output, null, 2))) };
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
      execute: ({ request }, { toolCallId, abortSignal }) => delegateWritingRun(ctx, { request }, toolCallId, abortSignal),
      toModelOutput: ({ output }) => specialistModelOutput(output),
    }),
    delegateEditing: tool({
      description:
        "Ask the editing specialist for a final review of the open post before the user publishes it: a score, issues with quotes, and 8 server-run checks (length, hook length, hashtags, banned words, placeholders, markdown, links, emoji). It changes nothing; offer fixes with updateDocument or proposeDocumentEdits afterwards. Say in `request` what the user wants checked.",
      inputSchema: z.object({
        request: z.string().min(1).max(REQUEST_MAX),
        specialty: z.enum(["final-review"]),
      }),
      execute: ({ request }, { toolCallId, abortSignal }) => delegateEditingRun(ctx, { request }, toolCallId, abortSignal),
      toModelOutput: ({ output }) => specialistModelOutput(output, "editing specialist"),
    }),
  };
}
