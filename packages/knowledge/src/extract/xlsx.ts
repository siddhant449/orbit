import * as XLSX from "xlsx";

/** One block per sheet: the sheet name, then its rows as CSV. */
export function extractXlsx(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((name) => `${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name]!)}`).join("\n\n");
}
