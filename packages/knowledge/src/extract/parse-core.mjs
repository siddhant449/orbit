// Document parsing for untrusted bytes. Runs only inside the parse worker (see run-parser.ts).
import { UserError, assertInflatesWithin, assertSafeZip } from "./zip-limits.mjs";

export const PDF_MAX_PAGES = 500;
export const XLSX_MAX_SHEETS = 10;
export const XLSX_MAX_ROWS = 5000;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function pdf(buf, maxChars) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buf));
  if (doc.numPages > PDF_MAX_PAGES) throw new UserError("That PDF has too many pages (500 at most)");
  let out = "";
  for (let n = 1; n <= doc.numPages && out.length < maxChars; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ").trim();
    if (text) out += (out ? "\n\n" : "") + text;
  }
  return out.slice(0, maxChars);
}

async function docx(buf, maxChars) {
  const { default: mammoth } = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value.slice(0, maxChars);
}

const cell = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

async function xlsx(buf, maxChars) {
  const { default: readExcelFile } = await import("read-excel-file/node");
  let out = "";
  for (const { sheet, data } of (await readExcelFile(buf)).slice(0, XLSX_MAX_SHEETS)) {
    out += `${out ? "\n\n" : ""}${sheet}\n`;
    for (const row of data.slice(0, XLSX_MAX_ROWS)) {
      if (out.length >= maxChars) return out.slice(0, maxChars);
      out += row.map(cell).join("\t") + "\n";
    }
    if (out.length >= maxChars) break;
  }
  return out.slice(0, maxChars);
}

export async function parseDocument({ buf, mime, maxChars, maxInflateBytes }) {
  buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (mime === DOCX || mime === XLSX) {
    assertSafeZip(buf, { maxBytes: maxInflateBytes });
    assertInflatesWithin(buf, maxInflateBytes);
    return mime === DOCX ? docx(buf, maxChars) : xlsx(buf, maxChars);
  }
  if (mime === "application/pdf") return pdf(buf, maxChars);
  throw new UserError("That file type isn't supported");
}
