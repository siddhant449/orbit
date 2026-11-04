import { createOpenAI, openai as plainOpenai } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel, Tool } from "ai";
import { quotaAwareFetch } from "./errors";
import { CHAT_MODELS } from "./models";

/** Every OpenAI call goes through here so an out-of-credits answer is never retried (see `quotaAwareFetch`). Without a key it reads OPENAI_API_KEY at request time. */
const provider = (apiKey?: string) => createOpenAI({ ...(apiKey ? { apiKey } : {}), fetch: quotaAwareFetch() });

export type ModelAlias = "generate" | "extract" | "write";

/**
 * The OpenAI text models the app may run. Cost control: only the cheapest model is allowed, so an environment setting
 * that names anything else (e.g. a leftover AI_MODEL_WRITE=gpt-6.1-sol) is ignored and Luna runs instead. To allow a
 * costlier model again, add it here (and to CHAT_MODELS for the picker).
 */
export const ALLOWED_TEXT_MODELS: readonly string[] = CHAT_MODELS.map((m) => m.id);
const DEFAULT_TEXT_MODEL = "gpt-6-luna";
const warned = new Set<string>();
function allowed(name: string, value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (ALLOWED_TEXT_MODELS.includes(v)) return v;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[ai] ${name}=${v} is not an allowed model (cost control); using ${DEFAULT_TEXT_MODEL}`);
  }
  return undefined;
}

/**
 * Maps a model alias to an OpenAI model ID. Override per environment with AI_MODEL_GENERATE / AI_MODEL_EXTRACT /
 * AI_MODEL_WRITE, limited to ALLOWED_TEXT_MODELS. "write" is the step that writes or rewrites post text (writer,
 * editor, hooks, repair); it follows "generate" unless AI_MODEL_WRITE names an allowed model.
 */
export function resolveModel(alias: ModelAlias): string {
  if (alias === "write") return allowed("AI_MODEL_WRITE", process.env.AI_MODEL_WRITE) ?? resolveModel("generate");
  return alias === "generate"
    ? (allowed("AI_MODEL_GENERATE", process.env.AI_MODEL_GENERATE) ?? DEFAULT_TEXT_MODEL)
    : (allowed("AI_MODEL_EXTRACT", process.env.AI_MODEL_EXTRACT) ?? DEFAULT_TEXT_MODEL);
}

/**
 * The AI SDK language model for an alias. Shared by the background-job client
 * and the chat agent (`streamText`). Lazy: building a model never reads or
 * requires OPENAI_API_KEY, so importing this never throws on a keyless server.
 *
 * Pass `apiKey` to bind a specific key; otherwise the default provider reads
 * OPENAI_API_KEY from the environment when a request is made.
 */
export function getModel(alias: ModelAlias, apiKey?: string): LanguageModel {
  return provider(apiKey)(resolveModel(alias));
}

/** A specific chat model by ID (the user's pick). The caller checks the ID against `isChatModel` first. */
export function getModelById(id: string, apiKey?: string): LanguageModel {
  return provider(apiKey)(id);
}

/** Embedding model ID. Override with AI_MODEL_EMBED. */
export function resolveEmbeddingModel(): string {
  return process.env.AI_MODEL_EMBED ?? "text-embedding-3-small";
}

/** The AI SDK embedding model. Lazy like getModel: never reads the key at build time. */
export function getEmbeddingModel(apiKey?: string): EmbeddingModel {
  const id = resolveEmbeddingModel();
  return provider(apiKey).embedding(id);
}

/**
 * OpenAI's hosted web search for the chat agent (provider-executed: OpenAI runs it and streams the
 * result back). Registered under the tool key `web_search`. Building it never reads the key.
 */
export function webSearchTool(): Tool {
  return plainOpenai.tools.webSearch({}) as Tool;
}
