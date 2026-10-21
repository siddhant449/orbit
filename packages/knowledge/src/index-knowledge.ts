import type { Embedder } from "@brandloop/ai";
import { getKnowledgeItem, replaceChunks } from "@brandloop/db";
import { chunkText } from "./chunk";

/**
 * (Re)builds the search chunks for a knowledge item. Embeds `title + chunk`; if
 * embedding fails or there is no embedder, chunks are stored with null embeddings
 * (full-text search still works) and `embedded` is false.
 */
export async function indexKnowledge(
  deps: { embedder: Embedder | null },
  itemId: string,
): Promise<{ chunks: number; embedded: boolean }> {
  const item = await getKnowledgeItem(itemId);
  if (!item) return { chunks: 0, embedded: false };

  const pieces = chunkText(item.content ?? "");
  const guard = { content: item.content };
  if (pieces.length === 0) {
    await replaceChunks(item.profileId, "KNOWLEDGE", item.id, [], guard);
    return { chunks: 0, embedded: false };
  }

  let vectors: number[][] | null = null;
  if (deps.embedder) {
    try {
      const out = await deps.embedder.embed(pieces.map((p) => `${item.title}\n\n${p}`));
      if (out.length === pieces.length) vectors = out;
      else console.warn(`indexKnowledge: embedder returned ${out.length} vectors for ${pieces.length} chunks`);
    } catch (err) {
      console.warn("indexKnowledge: embedding failed, storing text only:", err instanceof Error ? err.message : String(err));
    }
  }

  // Skipped (null) when the item was deleted or edited while we embedded; a newer job owns indexing then.
  const stored = await replaceChunks(
    item.profileId,
    "KNOWLEDGE",
    item.id,
    pieces.map((text, ordinal) => ({ ordinal, title: item.title, text, embedding: vectors?.[ordinal] ?? null })),
    guard,
  );
  if (stored === null) return { chunks: 0, embedded: false };
  return { chunks: pieces.length, embedded: vectors !== null };
}
