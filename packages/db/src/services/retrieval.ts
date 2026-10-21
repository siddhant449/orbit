import type { Embedder } from "@brandloop/ai";
import type { ChunkSource } from "../generated/prisma/client";
import { prisma } from "../client";

export const RRF_K = 60;
export const CANDIDATES = 40;
const MAX_CHUNKS_PER_SOURCE = 2;

export type ChunkInput = { ordinal: number; title: string; text: string; embedding: number[] | null };

const vec = (v: number[] | null) => (v ? `[${v.join(",")}]` : null);

/** Replaces all chunks of a source in one transaction. Returns the number stored. */
export async function replaceChunks(
  profileId: string,
  sourceType: ChunkSource,
  sourceId: string,
  chunks: ChunkInput[],
): Promise<number> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "KnowledgeChunk" WHERE "sourceType" = ${sourceType}::"ChunkSource" AND "sourceId" = ${sourceId}`;
    for (const c of chunks) {
      await tx.$executeRaw`
        INSERT INTO "KnowledgeChunk" (id, "profileId", "sourceType", "sourceId", ordinal, title, text, embedding, tsv)
        VALUES (gen_random_uuid()::text, ${profileId}, ${sourceType}::"ChunkSource", ${sourceId}, ${c.ordinal}, ${c.title}, ${c.text},
                ${vec(c.embedding)}::vector,
                setweight(to_tsvector('english', ${c.title}), 'A') || to_tsvector('english', ${c.text}))`;
    }
  });
  return chunks.length;
}

export async function deleteChunks(sourceType: ChunkSource, sourceId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "KnowledgeChunk" WHERE "sourceType" = ${sourceType}::"ChunkSource" AND "sourceId" = ${sourceId}`;
}

export type SearchHit = {
  sourceType: ChunkSource;
  sourceId: string;
  score: number;
  chunks: { id: string; ordinal: number; text: string; score: number }[];
};

type Row = { id: string; sourceType: ChunkSource; sourceId: string; ordinal: number; text: string; score: number };

/** Hybrid retrieval: pgvector cosine + full-text, fused with reciprocal rank fusion. */
export async function hybridSearch(
  profileId: string,
  query: string,
  opts: { embedder: Embedder | null; sources?: ChunkSource[]; limit?: number },
): Promise<SearchHit[]> {
  const limit = opts.limit ?? 10;
  const sources = opts.sources ?? ["KNOWLEDGE" as ChunkSource];
  let qv: string | null = null;
  if (opts.embedder) {
    try {
      const [v] = await opts.embedder.embed([query]);
      qv = v ? vec(v) : null;
    } catch (err) {
      console.error("hybridSearch: embedder failed, using full-text only:", err instanceof Error ? err.message : err);
    }
  }
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL hnsw.iterative_scan = relaxed_order");
    return tx.$queryRaw<Row[]>`
      WITH vec AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${qv}::vector) r FROM "KnowledgeChunk"
        WHERE ${qv}::text IS NOT NULL AND "profileId" = ${profileId} AND "sourceType"::text = ANY(${sources}) AND embedding IS NOT NULL
        ORDER BY embedding <=> ${qv}::vector LIMIT ${CANDIDATES}),
      fts AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) r
        FROM "KnowledgeChunk", websearch_to_tsquery('english', ${query}) q
        WHERE "profileId" = ${profileId} AND "sourceType"::text = ANY(${sources}) AND tsv @@ q LIMIT ${CANDIDATES})
      SELECT c.id, c."sourceType", c."sourceId", c.ordinal, c.text,
             (COALESCE(1.0/(${RRF_K}+vec.r),0) + COALESCE(1.0/(${RRF_K}+fts.r),0))::float8 AS score
      FROM "KnowledgeChunk" c LEFT JOIN vec ON vec.id = c.id LEFT JOIN fts ON fts.id = c.id
      WHERE vec.id IS NOT NULL OR fts.id IS NOT NULL ORDER BY score DESC LIMIT 80`;
  });

  const bySource = new Map<string, SearchHit>();
  for (const r of rows) {
    const key = `${r.sourceType}:${r.sourceId}`;
    let hit = bySource.get(key);
    if (!hit) {
      hit = { sourceType: r.sourceType, sourceId: r.sourceId, score: r.score, chunks: [] };
      bySource.set(key, hit);
    }
    if (hit.chunks.length < MAX_CHUNKS_PER_SOURCE) {
      hit.chunks.push({ id: r.id, ordinal: r.ordinal, text: r.text, score: r.score });
    }
  }
  return [...bySource.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
