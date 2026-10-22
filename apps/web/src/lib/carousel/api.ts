import { AiUnavailableError, type AiClient } from "@brandloop/ai";
import { readCappedJson } from "@/lib/chat-request";
import { AI_UNAVAILABLE_MESSAGE } from "@/lib/run-job";
import { generateSlides, GenerateRequestSchema, type VoiceGuide } from "./ai";
import type { Throttle } from "./throttle";

export type Session = { signedIn: false } | { signedIn: true; profileId: string | null };

export type GenerateDeps = {
  session: () => Promise<Session>;
  ai: () => AiClient;
  aiAvailable: () => boolean;
  voice: (profileId: string) => Promise<VoiceGuide>;
  throttle: Throttle;
};

/** A 6,000-character post plus 20 slides at their limits, JSON-escaped, with room to spare. */
export const GENERATE_BODY_MAX = 64_000;
/** Per profile: generations and rewrites share it. */
export const GENERATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

const fail = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });

/**
 * POST /api/carousel/generate: `{source?, rewrite?, slides?}` → `{slides: {title, body}[]}`. Stateless: nothing is
 * stored (carousels have no storage yet). 401 signed out, 413 over the body cap, 429 over the profile's limit, 503
 * without an AI key, 502 when the model fails.
 */
export function makeGenerateHandler(deps: GenerateDeps) {
  return async function POST(request: Request): Promise<Response> {
    const session = await deps.session();
    if (!session.signedIn) return fail(401, "Sign in to generate slides.");
    if (!session.profileId) return fail(400, "Create a profile first.");
    if (!deps.aiAvailable()) return fail(503, AI_UNAVAILABLE_MESSAGE);
    const body = await readCappedJson(request, GENERATE_BODY_MAX);
    if (!body.ok) return body.tooLarge ? fail(413, "That post is too long to turn into slides.") : fail(400, "That request isn't valid.");
    const parsed = GenerateRequestSchema.safeParse(body.value);
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "That request isn't valid.");
    const slot = deps.throttle.take(session.profileId);
    if (!slot.ok) {
      const minutes = Math.ceil(slot.retryAfterSec / 60);
      return fail(429, `That's a lot of slides in a short time. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`, {
        "retry-after": String(slot.retryAfterSec),
      });
    }
    try {
      const voice = await deps.voice(session.profileId).catch(() => null);
      const slides = await generateSlides(deps.ai(), parsed.data, voice, request.signal);
      return Response.json({ slides });
    } catch (err) {
      if (err instanceof AiUnavailableError) return fail(503, AI_UNAVAILABLE_MESSAGE);
      console.error(`[carousel] generate failed: ${err instanceof Error ? err.message : String(err)}`);
      return fail(502, "Orbit couldn't write the slides this time. Try again.");
    }
  };
}
