import type { AiClient } from "@brandloop/ai";
import { KNOWLEDGE_EXTRACTED_MAX } from "@brandloop/db";
import { IngestError } from "../errors";
import { extractImage } from "./image";
import { extractPlain } from "./plain";
import { extractUrl } from "./url";
import { parseInWorker } from "./run-parser";
import { assertSafeZip } from "./zip-limits.mjs";
import { DOCUMENT_TYPES } from "../limits";
import type { ResourceLimits } from "node:worker_threads";

export { assertPublicUrl, makePinnedLookup } from "./url";

export type ExtractInput =
  | { kind: "document"; buf: Buffer; mime: string }
  | { kind: "url"; url: string }
  | { kind: "image"; buf: Buffer; mime: string };

export type ExtractDeps = { ai: AiClient; fetch?: typeof fetch; maxChars?: number;
  timeoutMs?: number;
  maxInflateBytes?: number;
  resourceLimits?: ResourceLimits;
  /** Test seam: alternative worker entry file. */
  workerFile?: string;
};

async function extractDocument(buf: Buffer, mime: string, deps: ExtractDeps, maxChars: number): Promise<string> {
  if (mime === "text/plain" || mime === "text/markdown") return extractPlain(buf).slice(0, maxChars);
  if (!(mime in DOCUMENT_TYPES)) throw new IngestError("That file type isn't supported");
  try {
    // Cheap pass first, so an obvious zip bomb never costs a worker.
    if (mime.includes("openxmlformats")) assertSafeZip(buf, { maxBytes: deps.maxInflateBytes });
  } catch (err) {
    if (err instanceof Error && err.name === "UserError") throw new IngestError(err.message);
    throw err;
  }
  return parseInWorker(
    { buf, mime, maxChars, maxInflateBytes: deps.maxInflateBytes },
    { timeoutMs: deps.timeoutMs, resourceLimits: deps.resourceLimits, workerFile: deps.workerFile },
  );
}

export async function extractText(input: ExtractInput, deps: ExtractDeps): Promise<string> {
  const maxChars = deps.maxChars ?? KNOWLEDGE_EXTRACTED_MAX;
  if (input.kind === "url") return (await extractUrl(input.url, deps.fetch)).slice(0, maxChars);
  if (input.kind === "image") return (await extractImage(input.buf, input.mime, deps.ai)).slice(0, maxChars);

  let text: string;
  try {
    text = await extractDocument(input.buf, input.mime, deps, maxChars);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError("Couldn't read that file");
  }
  if (!text.trim()) throw new IngestError("Couldn't find any text in that file");
  return text;
}
