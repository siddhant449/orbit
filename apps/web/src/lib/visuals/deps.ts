import { createAiClient, type AiClient } from "@brandloop/ai";
import { createImageProvider, type ImageInput, type ImageProvider, type ImageQuality } from "@brandloop/visuals";
import { isMockMode } from "@/lib/chat-deps";

export type VisualDeps = {
  provider: ImageProvider;
  /** The `extract` model for the safety classifier and edit rewrites; null means blocklist-only and raw edit words. */
  ai: AiClient | null;
  quality: ImageQuality;
  /** Aborts the provider call (150 s in production). */
  timeoutMs: number;
  /** A private reference image's bytes, or null. */
  loadReference: (profileId: string, referenceId: string) => Promise<ImageInput | null>;
  /** Operator log line. Never receives prompts, keys or response bodies. */
  log: (message: string) => void;
};

export const PROVIDER_TIMEOUT_MS = 150_000;

const g = globalThis as unknown as { __visualDeps?: VisualDeps };

/** Image generation is on in dev with the mock provider; in production only when a real provider is configured. */
export function visualsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const flag = env.VISUALS_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return env.NODE_ENV !== "production" || Boolean(env.OPENAI_API_KEY?.trim() && (env.VISUALS_PROVIDER ?? "openai") !== "mock");
}

export function getVisualDeps(): VisualDeps {
  return (g.__visualDeps ??= {
    provider: createImageProvider(process.env),
    // e2e/dev mock mode never calls a live model; keyless servers fall back to the blocklist.
    ai: !isMockMode() && process.env.OPENAI_API_KEY ? createAiClient() : null,
    quality: (["low", "medium", "high"] as const).find((q) => q === process.env.VISUALS_QUALITY) ?? "medium",
    timeoutMs: PROVIDER_TIMEOUT_MS,
    loadReference: async () => null,
    log: (m) => console.warn(m),
  });
}

/** Tests only. */
export function setVisualDepsForTest(deps: VisualDeps | undefined): void {
  g.__visualDeps = deps;
}
