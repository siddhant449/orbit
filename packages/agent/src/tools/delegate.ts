import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { frameData, type DataSource } from "../data";
import { bannedWordsFromRules, mergeChecks, runDeterministicChecks, runWritingChecks } from "../specialists/checks";
import { lintPost, type Violation } from "../writing/lint";
import { polishDraft, polishSummary, polishText } from "../writing/polish";
import { acceptOverrides, resolveRules, type TurnOverrides } from "../writing/rules";
import { stampEnvelope, type FinalReview, type HandoffEnvelope, type PostWriting } from "../specialists/envelope";
import { buildGrounding, provenanceText, renderGrounding } from "../specialists/grounding";
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

const SpineSchema = z.object({ claim: z.string(), mustDeliver: z.string(), bodyShape: z.string() });
export type Spine = z.infer<typeof SpineSchema>;
const OverridesSchema = z.object({
  allowEmoji: z.boolean().nullable(),
  allowHashtags: z.boolean().nullable(),
  allowDashes: z.boolean().nullable(),
  allowPostscript: z.boolean().nullable(),
  allowLinks: z.boolean().nullable(),
});

export type WritingInput = {
  request: string;
  personalDetails?: "allowed" | "none" | null;
  overrides?: TurnOverrides | null;
  chosenHook?: { text: string; spine: Spine | null } | null;
};

/** The brief the writer sees: the orchestrator's request, then the server's own contract lines (never model-written). */
function briefFor(input: WritingInput, personal: "allowed" | "none", accepted: Partial<TurnOverrides>): string {
  const lines = [input.request];
  if (personal === "none") lines.push("personalDetails: none. Write claims about the subject only; no first-person experience claims.");
  if (Object.keys(accepted).length) lines.push(`The user asked in this message to allow: ${Object.keys(accepted).map((k) => k.replace(/^allow/, "").toLowerCase()).join(", ")}.`);
  const hook = input.chosenHook;
  if (hook) {
    lines.push(`chosenHook: open the post with exactly this hook: "${hook.text}"`);
    if (hook.spine) lines.push(`The hook promises: ${hook.spine.claim}. The post must deliver: ${hook.spine.mustDeliver}. Body shape: ${hook.spine.bodyShape}.`);
  }
  return lines.join("\n\n");
}

const MAX_FINDINGS = 8;
const describeViolation = (v: Violation) => `Rule check (${v.level}): ${v.detail}`;

/**
 * Runs the writing specialist and returns its stamped envelope, or a `Failed:` string. The envelope is
 * kept in `ctx.handoffs` under this tool call's id, so `createDocument` can take the draft from it.
 *
 * delegateWriting only ever feeds createDocument (specialty "post", a new post). Rewrites of the open
 * post go through updateDocument, which runs its own editing call. So when the chat already has a post
 * this returns the EXISTING_POST guidance without spending a model call on a draft that couldn't be saved.
 * The abort signal (stop, turn deadline) cancels the specialist call and is rethrown, never reported.
 *
 * Writing engine (design §3, §4): rule overrides count only when the user's own message names them; the writer returns
 * blocks that the server renders; the result is linted against the effective rules and the user's material, and the
 * findings (never the draft) say what broke. Repair arrives with the polish pass.
 */
export async function delegateWritingRun(
  ctx: TurnContext,
  input: WritingInput,
  toolCallId: string,
  abortSignal?: AbortSignal,
): Promise<HandoffEnvelope<PostWriting> | string> {
  if (ctx.documentRef.current) return EXISTING_POST;
  try {
    const personal = input.personalDetails ?? "allowed";
    const accepted = acceptOverrides(input.overrides ?? null, ctx.userText);
    const grounding = await buildGrounding({
      profileId: ctx.profileId,
      request: input.request,
      knowledgeIds: ctx.selections.knowledgeIds,
      writingStyleId: ctx.selections.writingStyleId,
      embedder: ctx.embedder,
      turn: accepted,
    });
    const request = briefFor(input, personal, accepted);
    // A new post: there is no open document (see the short-circuit above), so no source revision either.
    const res = await runSpecialist(ctx.ai, "post-writing", {
      request,
      grounding: renderGrounding(grounding),
      document: null,
      skills: WRITING_SKILLS,
      abortSignal,
      render: { bullet: grounding.style.bullet, numbered: true },
    });
    if (!res.ok) {
      return `Failed: the writing specialist couldn't produce a usable draft (${res.reason}). Ask the user to rephrase or try again.`;
    }
    const output = res.output;
    let payload = output.payload;
    const extra: string[] = [];
    if (payload.readiness === "ready" && payload.draft) {
      const lintCtx = {
        postType: payload.postType ?? null,
        groundingText: provenanceText(grounding, input.request),
        researchDates: null,
        personalDetails: personal,
      };
      const common = { rules: grounding.rules, lintCtx, request: input.request, grounding: renderGrounding(grounding), deadline: ctx.deadline, abortSignal, render: { bullet: grounding.style.bullet, numbered: true } };
      const started = Date.now();
      const polished = payload.blocks?.length
        ? await polishDraft(ctx.ai, { ...common, blocks: payload.blocks })
        : { ...(await polishText(ctx.ai, { ...common, text: payload.draft, document: { id: "new", title: payload.title, version: 0 } })), blocks: undefined };
      const note = polishSummary(polished.log);
      if (note) extra.push(note);
      payload = {
        ...payload,
        draft: polished.text,
        hook: (polished.text.split(/\n\s*\n/)[0] ?? polished.text).slice(0, 200),
        ...(polished.blocks ? { blocks: polished.blocks } : {}),
      };
      if (polished.log.mechanical.length + polished.log.lastResort.length > 0 || polished.log.modelRepair.attempted) {
        console.info(`[agent] polish: ${polished.log.mechanical.length} mechanical, model repair ${polished.log.modelRepair.attempted ? "yes" : "no"}, ${polished.log.lastResort.length} last resort, ${Date.now() - started} ms, ${polished.log.remaining.length} remaining`);
      }
      extra.push(...polished.log.remaining.sort((a, b) => Number(b.level === "hard") - Number(a.level === "hard")).slice(0, 3).map(describeViolation));
    }
    extra.push(...grounding.rules.dropped.map((d) => `Style rule left out: ${d.text} (${d.reason})`));
    const envelope = stampEnvelope(
      "post-writing",
      { ...output, payload, findings: [...extra, ...output.findings].slice(0, MAX_FINDINGS) },
      { toolCallId, taskId: ctx.taskId, request: input.request, document: null, style: grounding.style.ref, now: ctx.now() },
    );
    ctx.handoffs.set(toolCallId, envelope);
    return envelope;
  } catch (err) {
    if (isAbort(err)) throw err;
    console.error(`[agent] tool delegateWriting failed: ${err instanceof Error ? err.message : String(err)}`);
    return "Failed: something went wrong running delegateWriting.";
  }
}

/**
 * The final review (design §6.3): the server runs the 8 deterministic checks, then the writing checks for the user's hard rules, on the current post first, tells the
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
    const effective = resolveRules({ userRulesMarkdown: grounding.writingRules, style: null, turn: {} });
    const checks = mergeChecks(
      runDeterministicChecks(doc.text, { bannedWords: bannedWordsFromRules(grounding.writingRules) }),
      runWritingChecks(doc.text, effective, { postType: null, groundingText: null, researchDates: null, personalDetails: "allowed" }),
    );
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
        "Ask the writing specialist, who already has the user's voice, writing style, rules, identity and strategy, to draft a new LinkedIn post, or a set of short options (hook variations, openings, angles). Write a clear brief in `request`: the topic, the angle, the audience, the format if the user named one, how many options if they asked for options, and the specific facts, stories and numbers from memory or the knowledge base the post should use. Returns a handoff. For a post, then call createDocument with this call's id and never retype the draft. For options, show them to the user in your reply instead of creating a document.",
      inputSchema: z.object({
        request: z.string().min(REQUEST_MIN).max(REQUEST_MAX),
        specialty: z.enum(["post"]),
        personalDetails: z.enum(["allowed", "none"]).nullable().describe('"none" when the user said to skip personal details or personal anecdotes; otherwise "allowed" or null.'),
        overrides: OverridesSchema.nullable().describe("Only when the user's latest message asks to allow something their saved rules forbid for this one post (emoji, hashtags, dashes, a P.S., links). Otherwise null. The server ignores an override the user did not ask for."),
        chosenHook: z.object({ text: z.string(), spine: SpineSchema.nullable() }).nullable().describe("The hook the user picked, when they picked one."),
      }),
      execute: ({ request, personalDetails, overrides, chosenHook }, { toolCallId, abortSignal }) =>
        delegateWritingRun(ctx, { request, personalDetails, overrides, chosenHook }, toolCallId, abortSignal),
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
