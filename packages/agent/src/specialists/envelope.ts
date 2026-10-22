import { listMessages } from "@brandloop/db";
import { createHash } from "node:crypto";
import { PostTypeSchema } from "@brandloop/ai/style";
import { z } from "zod";
import type { TurnContext } from "../context";

/**
 * Specialists and the handoff envelope (design §6.3). A specialist proposes; the orchestrator and the
 * server decide. The envelope is the specialist's output plus fields only the server stamps.
 */

export const SPECIALIST_KINDS = ["post-writing", "final-review", "personal-grounding", "content-planning"] as const;
export type SpecialistKind = (typeof SPECIALIST_KINDS)[number];

export const CONFIDENCE = ["low", "medium", "high"] as const;
export const PARENT_ACTIONS = ["create-document", "update-document", "respond", "ask-user"] as const;

export const BLOCK_KINDS = ["hook", "prose", "bullets", "numbered", "close", "sources"] as const;
export const FACT_SOURCES = ["request", "knowledge", "memory", "research", "general"] as const;
const BlockSchema = z.object({ kind: z.enum(BLOCK_KINDS), lines: z.array(z.string()) });
const FactSchema = z.object({ text: z.string(), source: z.enum(FACT_SOURCES), ref: z.string().nullable() });

/**
 * What the post writer returns (design §3.2, §4.1): blocks, not text. The server renders `draft` and `hook` from the blocks.
 * Every key is required and nullable-not-optional for OpenAI strict mode; counts are checked after parsing.
 */
export const PostWritingModelPayload = z.object({
  readiness: z.enum(["ready", "needs-user-input"]),
  title: z.string(),
  postType: PostTypeSchema,
  blocks: z.array(BlockSchema),
  facts: z.array(FactSchema),
  missingFacts: z.array(z.string()),
  clarifyingQuestion: z.string().nullable(),
});

export const PostWritingPayload = z.object({
  readiness: z.enum(["ready", "needs-user-input"]),
  title: z.string().max(120),
  hook: z.string().max(200),
  draft: z.string().max(3_500),
  clarifyingQuestion: z.string().nullable(),
  // Added by the writing engine; absent on posts written before it, so optional here.
  postType: PostTypeSchema.optional(),
  blocks: z.array(BlockSchema).max(16).optional(),
  facts: z.array(FactSchema).max(12).optional(),
  missingFacts: z.array(z.string()).max(5).optional(),
});
export type PostWriting = z.infer<typeof PostWritingPayload>;

export const FinalReviewPayload = z.object({
  qualityReview: z.object({
    passed: z.boolean(),
    score: z.number().min(0).max(100),
    issues: z.array(z.object({ severity: z.enum(["low", "medium", "high"]), text: z.string(), quote: z.string().nullable() })).max(12),
    // The server overwrites these with `runDeterministicChecks` (specialists/checks.ts); the model's copy is never trusted.
    deterministicChecks: z.array(z.object({ id: z.string(), passed: z.boolean(), detail: z.string() })).max(12),
  }),
});
export type FinalReview = z.infer<typeof FinalReviewPayload>;

export const PersonalGroundingPayload = z.object({
  readiness: z.enum(["ready", "needs-user-input"]),
  context: z.array(z.string()).max(12),
  clarifyingQuestion: z.string().nullable(),
});

export const ContentPlanningPayload = z.object({
  ideas: z
    .array(z.object({ title: z.string(), angle: z.string(), hook: z.string(), contentType: z.string(), why: z.string() }))
    .max(7),
  context: z.array(z.string()).max(12),
  clarifyingQuestion: z.string().nullable(),
});

export const PAYLOADS = {
  "post-writing": PostWritingPayload,
  "final-review": FinalReviewPayload,
  "personal-grounding": PersonalGroundingPayload,
  "content-planning": ContentPlanningPayload,
} as const;
export type PayloadOf<K extends SpecialistKind> = z.infer<(typeof PAYLOADS)[K]>;

/** What the specialist model returns: a short report and the kind-specific payload. All keys are required (OpenAI strict). */
export function specialistOutputSchema<P extends z.ZodTypeAny>(payload: P) {
  return z.object({
    summary: z.string(),
    findings: z.array(z.string()).max(8),
    recommendation: z.string(),
    missingInput: z.array(z.string()).max(5),
    confidence: z.enum(CONFIDENCE),
    parentAction: z.enum(PARENT_ACTIONS),
    payload,
  });
}

export type SpecialistOutput<P> = {
  summary: string;
  findings: string[];
  recommendation: string;
  missingInput: string[];
  confidence: (typeof CONFIDENCE)[number];
  parentAction: (typeof PARENT_ACTIONS)[number];
  payload: P;
};
export type OutputOf<K extends SpecialistKind> = SpecialistOutput<PayloadOf<K>>;

export type HandoffEnvelope<P = unknown> = SpecialistOutput<P> & {
  specialist: SpecialistKind;
  authority: "proposal-only";
  /** The delegate tool call's id; createDocument and updateDocument refer to the handoff by it. */
  handoffId: string;
  taskId: string;
  createdAt: string;
  requestDigest: string;
  sourceRevisions: { document?: { id: string; version: number }; style?: { voiceStyleId: string; profileVersion: number } };
};

/** sha256 of `specialist + "\n" + request`, hex. */
export function requestDigest(kind: SpecialistKind, request: string): string {
  return createHash("sha256").update(`${kind}\n${request}`).digest("hex");
}

export function stampEnvelope<P>(
  kind: SpecialistKind,
  output: SpecialistOutput<P>,
  meta: {
    toolCallId: string;
    taskId: string;
    request: string;
    document: { id: string; version: number } | null;
    style?: { voiceStyleId: string; profileVersion: number } | null;
    now: Date;
  },
): HandoffEnvelope<P> {
  return {
    ...output,
    specialist: kind,
    authority: "proposal-only",
    handoffId: meta.toolCallId,
    taskId: meta.taskId,
    createdAt: meta.now.toISOString(),
    requestDigest: requestDigest(kind, meta.request),
    sourceRevisions: {
      ...(meta.document ? { document: { id: meta.document.id, version: meta.document.version } } : {}),
      ...(meta.style ? { style: meta.style } : {}),
    },
  };
}

/** The stamped fields a stored envelope must carry; the payload is checked by whoever uses it. */
const StoredEnvelopeSchema = specialistOutputSchema(z.unknown()).extend({
  specialist: z.enum(SPECIALIST_KINDS),
  authority: z.literal("proposal-only"),
  handoffId: z.string(),
  taskId: z.string(),
  createdAt: z.string(),
  requestDigest: z.string(),
  sourceRevisions: z.object({
    document: z.object({ id: z.string(), version: z.number() }).optional(),
    style: z.object({ voiceStyleId: z.string(), profileVersion: z.number() }).optional(),
  }),
});

const DELEGATE_PART = /^tool-delegate[A-Z]\w*$/;

/**
 * The envelope a tool call id refers to: this turn's handoffs first, then the completed `tool-delegate*`
 * parts stored in this chat (scoped to the caller's profile). Anything else is null, so an id the model
 * made up, or one from another chat, never resolves.
 */
export async function findHandoff(ctx: TurnContext, toolCallId: string): Promise<HandoffEnvelope | null> {
  const live = ctx.handoffs.get(toolCallId);
  if (live) return live;
  let messages;
  try {
    messages = await listMessages(ctx.profileId, ctx.chatId);
  } catch {
    return null;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    for (const part of m.parts as { type?: unknown; toolCallId?: unknown; state?: unknown; output?: unknown }[]) {
      if (typeof part?.type !== "string" || !DELEGATE_PART.test(part.type)) continue;
      if (part.toolCallId !== toolCallId || part.state !== "output-available") continue;
      const parsed = StoredEnvelopeSchema.safeParse(part.output);
      if (parsed.success && parsed.data.handoffId === toolCallId) return parsed.data as HandoffEnvelope;
    }
  }
  return null;
}
