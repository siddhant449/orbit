// Plain ESM (no TypeScript, no heavy imports) so both the host and the parse worker can load it.
import { inflateRawSync } from "node:zlib";

export const ZIP_MAX_UNCOMPRESSED = 100 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 2000;
export const TOO_LARGE = "That file is too large to read safely";

/** An error whose message is safe to show the user. */
export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = "UserError";
  }
}

function centralDirectory(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < Math.max(0, buf.length - 65_557) || eocd + 22 > buf.length) throw new UserError("Couldn't read that file");
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new UserError(TOO_LARGE); // zip64
  if (cdOffset + cdSize > buf.length) throw new UserError("Couldn't read that file");
  return { total, cdOffset };
}

function* entries(buf, total, cdOffset) {
  let pos = cdOffset;
  for (let i = 0; i < total; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new UserError("Couldn't read that file");
    yield {
      method: buf.readUInt16LE(pos + 10),
      compressed: buf.readUInt32LE(pos + 20),
      size: buf.readUInt32LE(pos + 24),
      localOffset: buf.readUInt32LE(pos + 42),
    };
    pos += 46 + buf.readUInt16LE(pos + 28) + buf.readUInt16LE(pos + 30) + buf.readUInt16LE(pos + 32);
  }
}

/** Cheap first pass: trusts the central directory's declared sizes (no decompression). */
export function assertSafeZip(buf, { maxEntries = ZIP_MAX_ENTRIES, maxBytes = ZIP_MAX_UNCOMPRESSED } = {}) {
  const { total, cdOffset } = centralDirectory(buf);
  if (total > maxEntries) throw new UserError(TOO_LARGE);
  let sum = 0;
  for (const e of entries(buf, total, cdOffset)) {
    if (e.size === 0xffffffff) throw new UserError(TOO_LARGE);
    sum += e.size;
    if (sum > maxBytes) throw new UserError(TOO_LARGE);
  }
}

/**
 * Real check: actually inflates every entry with a running output cap, ignoring the declared sizes,
 * so a lying central directory is caught before the parser (which would otherwise inflate it fully).
 */
export function assertInflatesWithin(buf, maxBytes = ZIP_MAX_UNCOMPRESSED) {
  const { total, cdOffset } = centralDirectory(buf);
  let used = 0;
  for (const e of entries(buf, total, cdOffset)) {
    if (e.localOffset + 30 > buf.length || buf.readUInt32LE(e.localOffset) !== 0x04034b50) {
      throw new UserError("Couldn't read that file");
    }
    const start = e.localOffset + 30 + buf.readUInt16LE(e.localOffset + 26) + buf.readUInt16LE(e.localOffset + 28);
    const data = buf.subarray(start, e.compressed === 0xffffffff ? undefined : start + e.compressed);
    if (e.method === 0) {
      used += data.length;
    } else if (e.method === 8) {
      try {
        used += inflateRawSync(data, { maxOutputLength: Math.max(1, maxBytes - used + 1) }).length;
      } catch (err) {
        if (err && err.code === "ERR_BUFFER_TOO_LARGE") throw new UserError(TOO_LARGE);
        throw new UserError("Couldn't read that file");
      }
    } else {
      throw new UserError("Couldn't read that file");
    }
    if (used > maxBytes) throw new UserError(TOO_LARGE);
  }
}
