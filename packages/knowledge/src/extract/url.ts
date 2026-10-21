import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { IngestError } from "../errors";

const UNREADABLE = "Couldn't read that page";
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_CHARS = 200;
const PRIVATE = "That link points to a private address";

function privateV4(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split(".").map(Number);
    return privateV4(a!, b!);
  }
  if (kind === 6) {
    if (h === "::" || h === "::1") return true;
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true;
    const mapped = h.match(/^::ffff:(?:(\d+)\.(\d+)\.\d+\.\d+|([0-9a-f]{1,4}):[0-9a-f]{1,4})$/);
    if (mapped) {
      if (mapped[1] !== undefined) return privateV4(Number(mapped[1]), Number(mapped[2]));
      const hi = parseInt(mapped[3]!, 16);
      return privateV4(hi >> 8, hi & 255);
    }
    return false;
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

/** With the real network, also refuse hostnames that resolve to private addresses. */
async function assertResolvesPublic(url: URL): Promise<void> {
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) return;
  let addrs: { address: string }[];
  try {
    addrs = await lookup(url.hostname, { all: true });
  } catch {
    throw new IngestError(UNREADABLE);
  }
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new IngestError(PRIVATE);
}

async function fetchPage(startUrl: string, doFetch: typeof fetch | undefined): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = assertPublicUrl(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!doFetch) await assertResolvesPublic(url);
    const res = await (doFetch ?? fetch)(url, {
      signal,
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; BrandloopBot/1.0)", accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new IngestError(UNREADABLE);
      url = assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new IngestError(UNREADABLE);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml|text\/plain/i.test(type)) throw new IngestError(UNREADABLE);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new IngestError(UNREADABLE);
    return (await res.text()).slice(0, MAX_BYTES);
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

