import { AiUnavailableError, type AiClient } from "@brandloop/ai";
import { getAccount } from "@/lib/account";
import { AI_UNAVAILABLE_MESSAGE } from "@/lib/run-job";
import { generateSlides, GenerateRequestSchema, type VoiceGuide } from "./ai";

export type GenerateDeps = {
  ai: () => AiClient;
  aiAvailable: () => boolean;
  voice: (profileId: string) => Promise<VoiceGuide>;
};

const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * POST /api/carousel/generate: `{source?, rewrite?, slides?}` → `{slides: {title, body}[]}`. Stateless: nothing is
 * stored (carousels have no storage yet). 503 without an AI key, 502 when the model fails.
 */
export function makeGenerateHandler(deps: GenerateDeps) {
  return async function POST(request: Request): Promise<Response> {
    const profileId = (await getAccount())?.currentProfile?.id;
    if (!profileId) return fail(400, "Create a profile first.");
    if (!deps.aiAvailable()) return fail(503, AI_UNAVAILABLE_MESSAGE);
    const parsed = GenerateRequestSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "That request isn't valid.");
    try {
      const voice = await deps.voice(profileId).catch(() => null);
      const slides = await generateSlides(deps.ai(), parsed.data, voice, request.signal);
      return Response.json({ slides });
    } catch (err) {
      if (err instanceof AiUnavailableError) return fail(503, AI_UNAVAILABLE_MESSAGE);
      console.error(`[carousel] generate failed: ${err instanceof Error ? err.message : String(err)}`);
      return fail(502, "Orbit couldn't write the slides this time. Try again.");
    }
  };
}
