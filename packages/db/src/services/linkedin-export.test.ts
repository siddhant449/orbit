import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_EXPORT_BYTES, parseCsv, parseSharesExport } from "./linkedin-export";

const long = (tag: string) => `${tag}. ` + "A sentence about shipping work that matters to customers. ".repeat(5);
const enc = (s: string) => new TextEncoder().encode(s);

const csv = (rows: string[][]) =>
  ["Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility", ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\r\n");

/** A one-file zip written by hand (stored or deflated), enough for the reader. */
function zip(name: string, content: string, method: 0 | 8 = 8): Uint8Array {
  const raw = Buffer.from(content);
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(n.length, 28);
  const offset = local.length + n.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([local, n, data, central, n, end]));
}

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, newlines inside a field, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","line1\nline2 ""q"""\r\nlast,end');
    expect(rows).toEqual([["a", "b"], ["x, y", 'line1\nline2 "q"'], ["last", "end"]]);
  });
});

describe("parseSharesExport", () => {
  const rows = [
    ["2026-09-01 10:00:00", "https://x/1", long("Newest"), "", "", "MEMBER_NETWORK"],
    ["2026-08-01 10:00:00", "https://x/2", "Too short", "", "", "MEMBER_NETWORK"],
    ["2026-07-01 10:00:00", "https://x/3", "", "https://shared/1", "", "MEMBER_NETWORK"],
    ["2026-06-01 10:00:00", "https://x/4", `${long("Multi")}\n\nSecond paragraph\nwith a break`, "", "", "MEMBER_NETWORK"],
    ["", "https://x/5", "", "", "", ""],
  ];

  it("keeps original posts of 200+ characters, newest first, and counts what it skipped", () => {
    const out = parseSharesExport(enc(csv(rows)), "Shares.csv");
    expect(out.posts).toHaveLength(2);
    expect(out.posts[0]!.text.startsWith("Newest")).toBe(true);
    expect(out.posts[0]!.postedAt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect(out.posts[1]!.text).toContain("Second paragraph\nwith a break");
    expect(out.skipped).toBe(3);
  });

  it("keeps the newest 100", () => {
    const many = Array.from({ length: 130 }, (_, i) => [`2026-01-01 00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`, "l", long(`p${i}`), "", "", ""]);
    const out = parseSharesExport(enc(csv(many)), "Shares.csv");
    expect(out.posts).toHaveLength(100);
    expect(out.posts[0]!.text.startsWith("p129")).toBe(true);
  });

  it("reads Shares.csv from the export zip and ignores every other file", () => {
    for (const method of [8, 0] as const) {
      const out = parseSharesExport(zip("Complete_LinkedInDataExport/Shares.csv", csv(rows), method), "export.zip");
      expect(out.posts).toHaveLength(2);
    }
    expect(() => parseSharesExport(zip("Connections.csv", "a,b"), "export.zip")).toThrow(/Shares\.csv/);
  });

  it("refuses a file over the size cap and a zip entry that inflates too far", () => {
    expect(() => parseSharesExport(new Uint8Array(MAX_EXPORT_BYTES + 1), "Shares.csv")).toThrow(/too large/i);
    const bomb = zip("Shares.csv", "a".repeat(30 * 1024 * 1024));
    expect(() => parseSharesExport(bomb, "export.zip")).toThrow(/too large/i);
  });

  it("refuses something that is not a Shares file", () => {
    expect(() => parseSharesExport(enc("a,b\n1,2"), "Shares.csv")).toThrow(/ShareCommentary/);
  });
});
