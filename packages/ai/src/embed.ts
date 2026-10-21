import { embedMany, type EmbeddingModel } from "ai";
import { AiUnavailableError } from "./client";
import { getEmbeddingModel } from "./provider";

export const EMBEDDING_DIMENSIONS = 1536;
const BATCH = 64;

export type Embedder = { embed(texts: string[]): Promise<number[][]> };

/**
 * OpenAI-backed embedder. Lazy: AiUnavailableError is thrown on the first
 * embed() without a key, never at construction. Batches 64 inputs per call.
 */
export function createEmbedder(
  apiKey: string | undefined = process.env.OPENAI_API_KEY,
  deps?: { model?: EmbeddingModel },
): Embedder {
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      if (!deps?.model && !apiKey) throw new AiUnavailableError();
      const model = deps?.model ?? getEmbeddingModel(apiKey);
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const { embeddings } = await embedMany({ model, values: texts.slice(i, i + BATCH) });
        for (const v of embeddings) {
          if (v.length !== EMBEDDING_DIMENSIONS) {
            throw new Error(`Embedding has ${v.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
          }
          out.push(v);
        }
      }
      return out;
    },
  };
}
