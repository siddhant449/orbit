import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ImageModel, LanguageModel, Tool } from "ai";

/**
 * Gemini, the automatic fallback when OpenAI is out of credits, rejecting our key or down. Off unless GEMINI_API_KEY is set.
 * The key is passed to the provider explicitly (the SDK would otherwise look for GOOGLE_GENERATIVE_AI_API_KEY) and never logged.
 *
 * Models (override per environment): GEMINI_MODEL_GENERATE / GEMINI_MODEL_EXTRACT / GEMINI_MODEL_WRITE and GEMINI_IMAGE_MODEL.
 * All three text aliases default to `gemini-3.5-flash`: a free-tier key has no Pro quota. Once billing exists, put post writing
 * on Pro with one setting, e.g. GEMINI_MODEL_WRITE=gemini-3.1-pro-preview (and AI_PRICE_<ID>="in,out" to tune its price estimate).
 */
export type GeminiAlias = "generate" | "extract" | "write";

const DEFAULT_TEXT_MODEL = "gemini-3.5-flash";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";

type Env = Record<string, string | undefined>;

export const geminiApiKey = (env: Env = process.env): string | undefined => env.GEMINI_API_KEY?.trim() || undefined;
export const geminiEnabled = (env: Env = process.env): boolean => geminiApiKey(env) !== undefined;

export function resolveGeminiModel(alias: GeminiAlias, env: Env = process.env): string {
  const name = { generate: "GEMINI_MODEL_GENERATE", extract: "GEMINI_MODEL_EXTRACT", write: "GEMINI_MODEL_WRITE" }[alias];
  return env[name]?.trim() || DEFAULT_TEXT_MODEL;
}

export const resolveGeminiImageModel = (env: Env = process.env): string => env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;

/** True for a model id that belongs to Google (ledger rows and the admin banner tell the fallback apart by this). */
export const isGeminiModelId = (id: string): boolean => /^(gemini|nano-banana)/i.test(id);

const provider = (env: Env) => createGoogleGenerativeAI({ apiKey: geminiApiKey(env)! });

/** The Gemini language model for an alias, or null without a key. */
export function getGeminiModel(alias: GeminiAlias, env: Env = process.env): LanguageModel | null {
  return geminiEnabled(env) ? provider(env)(resolveGeminiModel(alias, env)) : null;
}

/** The Gemini image model, or null without a key. */
export function getGeminiImageModel(env: Env = process.env): ImageModel | null {
  return geminiEnabled(env) ? provider(env).image(resolveGeminiImageModel(env)) : null;
}

/** Research on Gemini: the model plus Google Search grounding (the sources it returns are the citations). Null without a key. */
export function geminiResearchFallback(env: Env = process.env): { model: LanguageModel; tool: Tool } | null {
  if (!geminiEnabled(env)) return null;
  const p = provider(env);
  return { model: p(resolveGeminiModel("extract", env)), tool: p.tools.googleSearch({}) as Tool };
}
