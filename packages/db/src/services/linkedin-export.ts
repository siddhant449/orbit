import { inflateRawSync } from "node:zlib";

/** The upload cap, also enforced by the route (design §2.2, plan W4). */
export const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MIN_POST_CHARS = 200;
const KEEP = 100;
const TOO_LARGE = "That file is too large to read. Upload just Shares.csv from the export.";

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') (field += '"'), i++;
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS) throw new Error(TOO_LARGE);
    } else field += c;
  }
  if (field !== "" || row.length) (row.push(field), rows.push(row));
  return rows;
}

/** Reads only the Shares.csv entry of an export zip; every other file stays unread. Sizes are checked before inflating. */
function sharesFromZip(zip: Buffer): string {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That doesn't look like a LinkedIn export. Upload the zip or Shares.csv.");
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < Math.min(entries, 10_000); n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const compressed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!/(^|\/)shares\.csv$/i.test(name)) continue;
    if (size > MAX_UNZIPPED_BYTES) throw new Error(TOO_LARGE);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + compressed);
    try {
      const out = method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES });
      return out.toString("utf8");
    } catch {
      throw new Error(TOO_LARGE);
    }
  }
  throw new Error("That zip has no Shares.csv. In LinkedIn's data export, choose the Shares file.");
}

/**
 * LinkedIn's "Get a copy of your data" Shares file (or the whole zip) to the user's own original posts: 200+ characters,
 * reshares and empty rows dropped, newest 100 kept. Nothing else in the zip is read.
 */
export function parseSharesExport(file: Uint8Array, name: string): { posts: { text: string; postedAt: Date | null }[]; skipped: number } {
  if (file.byteLength > MAX_EXPORT_BYTES) throw new Error(TOO_LARGE);
  const buf = Buffer.from(file);
  const isZip = /\.zip$/i.test(name) || buf.readUInt32LE(0) === 0x04034b50;
  const table = parseCsv(isZip ? sharesFromZip(buf) : buf.toString("utf8"));
  const header = table[0]?.map((h) => h.trim()) ?? [];
  const textCol = header.indexOf("ShareCommentary");
  const dateCol = header.indexOf("Date");
  if (textCol < 0) throw new Error("That file has no ShareCommentary column. Upload Shares.csv from LinkedIn's data export.");
  const posts: { text: string; postedAt: Date | null }[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    if (r.every((c) => c.trim() === "")) continue;
    const text = (r[textCol] ?? "").replace(/\r\n?/g, "\n").trim();
    if (text.length < MIN_POST_CHARS) {
      skipped++;
      continue;
    }
    const d = dateCol >= 0 ? new Date(`${(r[dateCol] ?? "").trim().replace(" ", "T")}Z`) : null;
    posts.push({ text, postedAt: d && !Number.isNaN(d.getTime()) ? d : null });
  }
  posts.sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0));
  return { posts: posts.slice(0, KEEP), skipped };
}
