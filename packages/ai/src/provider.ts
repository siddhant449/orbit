import { createOpenAI, openai } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel, Tool } from "ai";

export type ModelAlias = "generate" | "extract";

/**
 * Maps a model alias to an OpenAI model ID. Override per environment with
 * AI_MODEL_GENERATE / AI_MODEL_EXTRACT.
 */
export function resolveModel(alias: ModelAlias): string {
  return alias === "generate"
    ? (process.env.AI_MODEL_GENERATE ?? "gpt-6.1-sol")
    : (process.env.AI_MODEL_EXTRACT ?? "gpt-6-luna");
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
  const id = resolveModel(alias);
  return apiKey ? createOpenAI({ apiKey })(id) : openai(id);
}

/** A specific chat model by ID (the user's pick). The caller checks the ID against `isChatModel` first. */
export function getModelById(id: string, apiKey?: string): LanguageModel {
  return apiKey ? createOpenAI({ apiKey })(id) : openai(id);
}

/** Embedding model ID. Override with AI_MODEL_EMBED. */
export function resolveEmbeddingModel(): string {
  return process.env.AI_MODEL_EMBED ?? "text-embedding-3-small";
}

/** The AI SDK embedding model. Lazy like getModel: never reads the key at build time. */
export function getEmbeddingModel(apiKey?: string): EmbeddingModel {
  const id = resolveEmbeddingModel();
  return apiKey ? createOpenAI({ apiKey }).embedding(id) : openai.embedding(id);
}

/**
 * OpenAI's hosted web search for the chat agent (provider-executed: OpenAI runs it and streams the
 * result back). Registered under the tool key `web_search`. Building it never reads the key.
 */
export function webSearchTool(): Tool {
  return openai.tools.webSearch({}) as Tool;
}
