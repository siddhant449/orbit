import { AiUnavailableError, type AiClient, type ModelAlias } from "@brandloop/ai";
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { defuseTags } from "../data";
import { isAbort } from "../tools/run";
import { PAYLOADS, specialistOutputSchema, type OutputOf, type SpecialistKind } from "./envelope";
import { RETRY_REMINDER, SKILL_NOTES, SPECIALIST_SYSTEM } from "./prompts";

export type SpecialistResult<O> = { ok: true; output: O } | { ok: false; reason: string };

type SpecialistDocument = { id: string; title: string; version: number; text: string };

/**
 * What the model is asked to produce. OpenAI strict schemas don't reliably accept string length limits,
 * so the post writer's request schema omits them; the real limits are enforced on the result.
 */
const MODEL_PAYLOADS: Record<SpecialistKind, z.ZodTypeAny> = {
  ...PAYLOADS,
  "post-writing": z.object({
    readiness: z.enum(["ready", "needs-user-input"]),
    title: z.string(),
    hook: z.string(),
    draft: z.string(),
    clarifyingQuestion: z.string().nullable(),
  }),
};

const MODEL_ALIAS: Record<SpecialistKind, ModelAlias> = {
  "post-writing": "generate",
  "final-review": "generate",
  "personal-grounding": "extract",
  "content-planning": "generate",
};

/** A recoverable failure: worth one more try with a stricter reminder. */
class SoftFailure extends Error {}

function classify(err: unknown): { retry: boolean; reason: string } {
  if (err instanceof SoftFailure) return { retry: true, reason: err.message };
  if (err instanceof z.ZodError) return { retry: true, reason: "the output didn't match the expected format" };
  if (NoObjectGeneratedError.isInstance(err)) return { retry: true, reason: "the output didn't match the expected format" };
  const message = err instanceof Error ? err.message : "";
  if (/declined/i.test(message)) return { retry: true, reason: "the model declined" };
  if (err instanceof AiUnavailableError) return { retry: false, reason: "the AI service is unavailable" };
  return { retry: false, reason: "the AI request failed" };
}

function emptiness(kind: SpecialistKind, output: OutputOf<SpecialistKind>): string | null {
  if (kind === "post-writing") {
    const p = output.payload as OutputOf<"post-writing">["payload"];
    if (p.readiness === "ready" && !p.draft.trim()) return "empty draft";
  }
  return null;
}

function documentBlock(doc: SpecialistDocument | null): string {
  if (!doc) return "No post is open.";
  const attr = (t: string) => defuseTags(t).replace(/[\s"<>]+/g, " ").trim();
  return `<open_document id="${attr(doc.id)}" version="${doc.version}" title="${attr(doc.title)}">\n${defuseTags(doc.text)}\n</open_document>`;
}

function systemFor(kind: SpecialistKind, skills: string[], retry: boolean): string {
  const notes = skills.map((s) => SKILL_NOTES[s]).filter((n): n is string => Boolean(n));
  const skillText = notes.length > 0 ? `\n\n# Skills\n${notes.join("\n\n")}` : "";
  return `${SPECIALIST_SYSTEM[kind]}${skillText}${retry ? RETRY_REMINDER : ""}`;
}

/**
 * One specialist call (design §6.3): its own system prompt and skills, the request, the rendered grounding
 * and the open post. No tools. A declined reply, a schema failure or an empty draft is retried once; then,
 * or on any other failure, it returns `ok: false` with a short provider-free reason. Never throws, except
 * to unwind an abort.
 */
export async function runSpecialist<K extends SpecialistKind>(
  ai: AiClient,
  kind: K,
  input: {
    request: string;
    grounding: string;
    document: SpecialistDocument | null;
    skills: string[];
    /** The tool call's signal: a stop or the turn deadline cancels the call and skips any retry. */
    abortSignal?: AbortSignal;
  },
): Promise<SpecialistResult<OutputOf<K>>> {
  const signal = input.abortSignal;
  const strict = specialistOutputSchema(PAYLOADS[kind]);
  const asked = specialistOutputSchema(MODEL_PAYLOADS[kind]);
  const prompt = [`<request>\n${defuseTags(input.request)}\n</request>`, input.grounding, documentBlock(input.document)].join("\n\n");

  let reason = "the AI request failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    try {
      const raw = await ai.json({
        model: MODEL_ALIAS[kind],
        system: systemFor(kind, input.skills, attempt > 0),
        prompt,
        schema: asked,
        abortSignal: signal,
      });
      const output = strict.parse(raw) as OutputOf<K>;
      const empty = emptiness(kind, output);
      if (empty) throw new SoftFailure(empty);
      return { ok: true, output };
    } catch (err) {
      if (isAbort(err)) throw err;
      // Stopped while the call was failing: unwind instead of reporting (or retrying) the failure.
      signal?.throwIfAborted();
      const c = classify(err);
      reason = c.reason;
      console.warn(`[agent] specialist ${kind} attempt ${attempt + 1} failed: ${reason}`);
      if (!c.retry) break;
    }
  }
  signal?.throwIfAborted();
  return { ok: false, reason };
}
