import { getDocumentProxy } from "unpdf";
import { IngestError } from "../errors";

export const PDF_MAX_PAGES = 500;

/** Page by page, stopping once `maxChars` is reached. */
export async function extractPdf(buf: Buffer, maxChars: number): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  if (pdf.numPages > PDF_MAX_PAGES) throw new IngestError("That PDF has too many pages (500 at most)");
  let out = "";
  for (let n = 1; n <= pdf.numPages && out.length < maxChars; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ").trim();
    if (text) out += (out ? "\n\n" : "") + text;
  }
  return out.slice(0, maxChars);
}
