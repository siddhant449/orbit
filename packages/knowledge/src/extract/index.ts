import type { AiClient } from "@brandloop/ai";
import { KNOWLEDGE_EXTRACTED_MAX } from "@brandloop/db";
import { IngestError } from "../errors";
import { extractDocx } from "./docx";
import { extractImage } from "./image";
import { extractPdf } from "./pdf";
import { extractPlain } from "./plain";
import { extractUrl } from "./url";
import { extractXlsx } from "./xlsx";

export { assertPublicUrl, makePinnedLookup } from "./url";

export type ExtractInput =
  | { kind: "document"; buf: Buffer; mime: string }
  | { kind: "url"; url: string }
  | { kind: "image"; buf: Buffer; mime: string };

export type ExtractDeps = { ai: AiClient; fetch?: typeof fetch; maxChars?: number; timeoutMs?: number };

export const EXTRACT_TIMEOUT_MS = 60_000;

/** Rejects with a readable message if `work` hasn't settled in `ms` (the work itself cannot be cancelled). */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IngestError("That file took too long to read")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function extractDocument(buf: Buffer, mime: string, maxChars: number): Promise<string> {
  switch (mime) {
    case "application/pdf":
      return extractPdf(buf, maxChars);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buf, maxChars);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractXlsx(buf, maxChars);
    case "text/plain":
    case "text/markdown":
      return extractPlain(buf).slice(0, maxChars);
    default:
      throw new IngestError("That file type isn't supported");
  }
}

export async function extractText(input: ExtractInput, deps: ExtractDeps): Promise<string> {
  const maxChars = deps.maxChars ?? KNOWLEDGE_EXTRACTED_MAX;
  if (input.kind === "url") return (await extractUrl(input.url, deps.fetch)).slice(0, maxChars);
  if (input.kind === "image") return (await extractImage(input.buf, input.mime, deps.ai)).slice(0, maxChars);

  let text: string;
  try {
    text = await withTimeout(extractDocument(input.buf, input.mime, maxChars), deps.timeoutMs ?? EXTRACT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError("Couldn't read that file");
  }
  if (!text.trim()) throw new IngestError("Couldn't find any text in that file");
  return text;
}
