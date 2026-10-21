import { AiUnavailableError, type AiClient, type Embedder } from "@brandloop/ai";
import {
  completeIngest,
  failIngest,
  getKnowledgeItem,
  KNOWLEDGE_EXTRACTED_MAX,
  type KnowledgeItem,
} from "@brandloop/db";
import { IngestError } from "./errors";
import { extractText } from "./extract";
import { indexKnowledge } from "./index-knowledge";
import type { UploadStore } from "./upload-store";

export type IngestDeps = { ai: AiClient; embedder: Embedder | null; store: UploadStore; fetch?: typeof fetch };

const VIDEO_PENDING = "Video support arrives shortly";
const SUMMARY_INPUT_CHARS = 12_000;

const SUMMARY_SYSTEM =
  "You write a two to three sentence summary of a document for a personal knowledge base. " +
  "State what it is and its main points. Plain text, no preamble, never reply conversationally.";

async function sourceText(deps: IngestDeps, item: KnowledgeItem): Promise<string> {
  // Stored content (text items, or an edit to an ingested item) is the source of truth; no re-extraction.
  if (item.content?.trim()) return item.content;
  switch (item.type) {
    case "VIDEO":
      throw new IngestError(VIDEO_PENDING);
    case "URL":
      return extractText({ kind: "url", url: item.sourceUrl ?? "" }, deps);
    case "DOCUMENT":
    case "IMAGE": {
      if (!item.fileKey || !item.mimeType) throw new IngestError("That file is missing");
      let buf: Buffer;
      try {
        buf = await deps.store.get(item.fileKey);
      } catch {
        throw new IngestError("That file is missing");
      }
      return extractText(
        item.type === "IMAGE"
          ? { kind: "image", buf, mime: item.mimeType }
          : { kind: "document", buf, mime: item.mimeType },
        deps,
      );
    }
    default:
      throw new IngestError("There's no text to process");
  }
}

/** Extracts text, summarises it, marks the item READY, then indexes it for search. Errors before READY mark the item FAILED. */
export async function ingestKnowledge(deps: IngestDeps, itemId: string): Promise<void> {
  const item = await getKnowledgeItem(itemId);
  if (!item) return;

  try {
    const text = (await sourceText(deps, item)).slice(0, KNOWLEDGE_EXTRACTED_MAX);
    let summary: string | null = null;
    try {
      summary = (await deps.ai.text({
        model: "extract",
        system: SUMMARY_SYSTEM,
        prompt: `Title: ${item.title}\n\n"""\n${text.slice(0, SUMMARY_INPUT_CHARS)}\n"""`,
      })) || null;
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
    }
    await completeIngest(item.id, text, summary);
  } catch (err) {
    await failIngest(item.id, err instanceof Error && err.message ? err.message : "Something went wrong");
    return;
  }

  // The item is READY; an indexing failure surfaces on the job without un-readying it.
  await indexKnowledge({ embedder: deps.embedder }, item.id);
}
