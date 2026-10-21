import readExcelFile from "read-excel-file/node";
import { assertSafeZip } from "./zip-guard";

export const XLSX_MAX_SHEETS = 10;
export const XLSX_MAX_ROWS = 5000;

const cell = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

/** One block per sheet (name, then rows as tab-separated lines); first 10 sheets, 5,000 rows each, stopping at `maxChars`. */
export async function extractXlsx(buf: Buffer, maxChars: number): Promise<string> {
  assertSafeZip(buf);
  const sheets = await readExcelFile(buf);
  let out = "";
  for (const { sheet, data } of sheets.slice(0, XLSX_MAX_SHEETS)) {
    out += `${out ? "\n\n" : ""}${sheet}\n`;
    for (const row of data.slice(0, XLSX_MAX_ROWS)) {
      if (out.length >= maxChars) return out.slice(0, maxChars);
      out += row.map(cell).join("\t") + "\n";
    }
    if (out.length >= maxChars) break;
  }
  return out.slice(0, maxChars);
}
