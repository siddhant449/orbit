import { NextResponse } from "next/server";
import { createAiClient, createEmbedder } from "@brandloop/ai";
import { KnowledgeError, type KnowledgeItem } from "@brandloop/db";
import { IngestError, ingestKnowledge, localUploadStore } from "@brandloop/knowledge";
import { startJob } from "@/lib/run-job";

export const uploadStore = localUploadStore();

/** Starts the KNOWLEDGE_INGEST job for an item after the response is sent. */
export function startIngest(profileId: string, itemId: string) {
  return startJob("KNOWLEDGE_INGEST", profileId, { itemId }, () =>
    ingestKnowledge({ ai: createAiClient(), embedder: createEmbedder(), store: uploadStore }, itemId),
  );
}

/** List/detail shape; the full content is only sent by the single-item GET. */
export function publicItem(item: KnowledgeItem, withContent = false) {
  const { content, teamId, fileKey, ...rest } = item;
  void teamId;
  void fileKey;
  return withContent ? { ...rest, content } : rest;
}

export function knowledgeErrorResponse(err: unknown): NextResponse {
  if (err instanceof KnowledgeError || err instanceof IngestError) {
    const status = err.message === "Item not found" ? 404 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
  throw err;
}
