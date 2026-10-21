import { IngestError } from "../errors";

export const ZIP_MAX_UNCOMPRESSED = 100 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 2000;
const TOO_LARGE = "That file is too large to read safely";

/**
 * Reads only the zip central directory (no decompression) and rejects archives that declare
 * more than 100 MB uncompressed or more than 2000 entries. Zip64 and malformed archives are rejected.
 */
export function assertSafeZip(buf: Buffer): void {
  const bad = new IngestError(TOO_LARGE);
  const searchFrom = Math.max(0, buf.length - 65_557);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < searchFrom || eocd + 22 > buf.length) throw new IngestError("Couldn't read that file");

  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw bad; // zip64
  if (total > ZIP_MAX_ENTRIES) throw bad;
  if (cdOffset + cdSize > buf.length) throw new IngestError("Couldn't read that file");

  let pos = cdOffset;
  let sum = 0;
  for (let i = 0; i < total; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new IngestError("Couldn't read that file");
    const size = buf.readUInt32LE(pos + 24);
    if (size === 0xffffffff) throw bad;
    sum += size;
    if (sum > ZIP_MAX_UNCOMPRESSED) throw bad;
    pos += 46 + buf.readUInt16LE(pos + 28) + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
}
