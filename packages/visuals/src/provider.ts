import type { ProviderSize } from "./aspect";
import { mockImageProvider } from "./mock";
import { openAiImageProvider } from "./openai";

export type ImageInput = { bytes: Buffer; mediaType: "image/png" | "image/jpeg" | "image/webp" };
export type ImageQuality = "low" | "medium" | "high";
export type ImageResult = { image: ImageInput; revisedPrompt?: string };

export type GenerateOptions = {
  prompt: string;
  size: ProviderSize;
  quality: ImageQuality;
  references?: ImageInput[];
  abortSignal?: AbortSignal;
};
export type EditOptions = {
  image: ImageInput;
  prompt: string;
  mask?: ImageInput;
  quality: ImageQuality;
  abortSignal?: AbortSignal;
};

/** The seam every image backend sits behind (OpenAI today, Gemini optional, a mock for tests and dev). */
export type ImageProvider = {
  /** "openai:<model>" | "gemini:<model>" | "mock" */
  id: string;
  generate(o: GenerateOptions): Promise<ImageResult>;
  edit(o: EditOptions): Promise<ImageResult>;
};

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2.5-flare";
export const DEFAULT_OPENAI_EDIT_MODEL = "gpt-image-2.5-sunburst";

export type ProviderEnv = Partial<
  Record<"VISUALS_PROVIDER" | "VISUALS_OPENAI_MODEL" | "VISUALS_OPENAI_EDIT_MODEL" | "OPENAI_API_KEY" | "NODE_ENV", string | undefined>
>;

/**
 * VISUALS_PROVIDER = openai | mock (gemini is not built yet). Default: OpenAI whenever OPENAI_API_KEY is set (dev
 * included, so the app never shows placeholder art where real images are possible); without a key, the mock outside
 * production. Tests and the offline e2e server ask for the mock explicitly. The mock is refused in production.
 */
export function createImageProvider(env: ProviderEnv = process.env): ImageProvider {
  const production = env.NODE_ENV === "production";
  const requested = env.VISUALS_PROVIDER?.trim() || (production || env.OPENAI_API_KEY?.trim() ? "openai" : "mock");
  switch (requested) {
    case "mock":
      if (production) throw new Error("VISUALS_PROVIDER=mock is not allowed in production");
      return mockImageProvider();
    case "openai": {
      const apiKey = env.OPENAI_API_KEY?.trim();
      if (!apiKey) throw new Error("VISUALS_PROVIDER=openai needs OPENAI_API_KEY");
      const model = env.VISUALS_OPENAI_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL;
      const editModel = env.VISUALS_OPENAI_EDIT_MODEL?.trim() || (env.VISUALS_OPENAI_MODEL?.trim() ? model : DEFAULT_OPENAI_EDIT_MODEL);
      return openAiImageProvider({ apiKey, model, editModel });
    }
    case "gemini":
      throw new Error("The gemini image provider is not available yet");
    default:
      throw new Error(`Unknown VISUALS_PROVIDER "${requested}" (use openai or mock)`);
  }
}
