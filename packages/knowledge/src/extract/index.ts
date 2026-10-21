import type { AiClient } from "@brandloop/ai";
import { IngestError } from "../errors";
import { extractDocx } from "./docx";
import { extractImage } from "./image";
import { extractPdf } from "./pdf";
import { extractPlain } from "./plain";
import { extractUrl } from "./url";
import { extractXlsx } from "./xlsx";

export { assertPublicUrl } from "./url";

export type ExtractInput =
  | { kind: "document"; buf: Buffer; mime: string }
  | { kind: "url"; url: string }
  | { kind: "image"; buf: Buffer; mime: string };

export async function extractText(input: ExtractInput, deps: { ai: AiClient; fetch?: typeof fetch }): Promise<string> {
  if (input.kind === "url") return extractUrl(input.url, deps.fetch);
  if (input.kind === "image") return extractImage(input.buf, input.mime, deps.ai);

  let text: string;
  try {
    switch (input.mime) {
      case "application/pdf":
        text = await extractPdf(input.buf);
        break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        text = await extractDocx(input.buf);
        break;
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        text = extractXlsx(input.buf);
        break;
      case "text/plain":
      case "text/markdown":
        text = extractPlain(input.buf);
        break;
      default:
        throw new IngestError("That file type isn't supported");
    }
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError("Couldn't read that file");
  }
  if (!text.trim()) throw new IngestError("Couldn't find any text in that file");
  return text;
}
