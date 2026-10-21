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

const GENERIC_ERROR = "Something went wrong reading this item.";

/** Only IngestError text is user-safe; anything else is logged (message only) and replaced. */
function safeMessage(err: unknown): string {
  if (err instanceof IngestError && err.message) return err.message;
  console.warn("ingestKnowledge failed:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  return GENERIC_ERROR;
}

/**
 * Extracts text, summarises it, marks the item READY, then indexes it for search.
 * Extraction errors mark the item FAILED and drop its chunks. A summary failure keeps any existing
 * summary. Writes are compare-and-set on the content the job started from, so a stale job does nothing.
 */
export async function ingestKnowledge(deps: IngestDeps, itemId: string): Promise<void> {
  const item = await getKnowledgeItem(itemId);
  if (!item) return;
  const started = { content: item.content };

  let text: string;
  try {
    text = (await sourceText(deps, item)).slice(0, KNOWLEDGE_EXTRACTED_MAX);
  } catch (err) {
    await failIngest(item.id, safeMessage(err), started); // also drops the chunks, atomically
    return;
  }

  let summary: string | undefined;
  try {
    summary =
      (await deps.ai.text({
        model: "extract",
        system: SUMMARY_SYSTEM,
        prompt: `Title: ${item.title}\n\n"""\n${text.slice(0, SUMMARY_INPUT_CHARS)}\n"""`,
      })) || undefined;
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) {
      console.warn("ingestKnowledge: summary failed:", err instanceof Error ? err.message : String(err));
    }
  }
  if (!(await completeIngest(item.id, text, summary, started))) return;

  // The item is READY; an indexing failure surfaces on the job without un-readying it.
  try {
    await indexKnowledge({ embedder: deps.embedder }, item.id);
  } catch (err) {
    console.warn("ingestKnowledge: indexing failed:", err instanceof Error ? err.message : String(err));
    throw new IngestError("Couldn't index this item for search");
  }
}
