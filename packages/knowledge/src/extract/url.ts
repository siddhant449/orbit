import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { IngestError } from "../errors";

const UNREADABLE = "Couldn't read that page";
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_CHARS = 200;
const PRIVATE = "That link points to a private address";

function blockedV4(o: number[]): boolean {
  const [a, b, c] = o as [number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Expands an IPv6 literal to 16 bytes (handles "::" and a trailing dotted IPv4); null when malformed. */
function v6Bytes(addr: string): number[] | null {
  let head = addr;
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const o = dotted[2]!.split(".").map(Number);
    head = dotted[1]! + ((o[0]! << 8) | o[1]!).toString(16) + ":" + ((o[2]! << 8) | o[3]!).toString(16);

  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const parse = (h: string) => (h ? h.split(":").map((g) => parseInt(g, 16)) : []);
  const left = parse(halves[0]!);
  const right = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = 8 - left.length - right.length;
  if ((halves.length === 1 && fill !== 0) || fill < 0) return null;
  const groups = [...left, ...new Array<number>(halves.length === 2 ? fill : 0).fill(0), ...right];
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  return groups.flatMap((g) => [g >> 8, g & 255]);
}

function isPrivateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const kind = isIP(h);
  if (kind === 4) return blockedV4(h.split(".").map(Number));
  if (kind === 6) {
    const b = v6Bytes(h);
    if (!b) return true;
    const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    return (
      zero(0, 12) || // ::/96 covers ::, ::1 and IPv4-compatible
      (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) || // ::ffff:0:0/96 mapped
      (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) || // 64:ff9b::/96
      (b[0] === 0x20 && b[1] === 0x02) || // 2002::/16
      (b[0]! & 0xfe) === 0xfc || // fc00::/7
      (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) || // fe80::/10
      b[0] === 0xff // ff00::/8
    );
  }
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal");
}

/** Throws IngestError unless `raw` is an http(s) URL whose literal host is not loopback or private. */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestError("Enter a link that starts with http:// or https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestError("Enter a link that starts with http:// or https://");
  }
  if (isPrivateAddress(url.hostname)) throw new IngestError(PRIVATE);
  return url;
}

type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;
const dnsResolve: Resolve = (host) => lookup(host, { all: true });

/**
 * A dns.lookup replacement for the HTTP connection itself: it resolves, rejects the connection if any
 * address is private, and hands back only validated addresses. Because the socket connects to what this
 * returned, a second DNS answer (rebinding) can never redirect it.
 */
export function makePinnedLookup(resolve: Resolve = dnsResolve) {
  return (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    cb: (err: Error | null, address?: unknown, family?: number) => void,
  ) => {
    resolve(hostname).then(
      (addrs) => {
        if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return cb(new IngestError(PRIVATE));
        if (typeof options === "object" && options?.all) return cb(null, addrs);
        cb(null, addrs[0]!.address, addrs[0]!.family);
      },
      () => cb(new IngestError(UNREADABLE)),
    );
  };
}

/** Reads at most MAX_BYTES, then cancels the stream. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8");
}

async function fetchPage(startUrl: string, doFetch: typeof fetch | undefined): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = assertPublicUrl(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers = { "user-agent": "Mozilla/5.0 (compatible; BrandloopBot/1.0)", accept: "text/html,application/xhtml+xml" };
    // One pinned agent per hop; always closed before the next hop or on return/throw.
    const agent = doFetch ? null : new Agent({ connect: { lookup: makePinnedLookup() as never } });
    try {
      const res = doFetch
        ? await doFetch(url, { signal, redirect: "manual", headers })
        : ((await undiciFetch(url, { signal, redirect: "manual", headers, dispatcher: agent! } as never)) as unknown as Response);
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => undefined);
        const location = res.headers.get("location");
        if (!location) throw new IngestError(UNREADABLE);
        url = assertPublicUrl(new URL(location, url).toString());
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || (type && !/html|xml|text\/plain/i.test(type))) {
        await res.body?.cancel().catch(() => undefined);
        throw new IngestError(UNREADABLE);
      }
      return await readCapped(res);
    } finally {
      await agent?.close().catch(() => undefined);
    }
  }
  throw new IngestError(UNREADABLE);
}

export async function extractUrl(url: string, doFetch?: typeof fetch): Promise<string> {
  let html: string;
  try {
    html = await fetchPage(url, doFetch);
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError(UNREADABLE);
  }
  let text = "";
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    text = (article?.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    /* fall through to the too-short check */
  }
  if (text.length < MIN_CHARS) throw new IngestError(UNREADABLE);
  return text;
}

