// First-load JS per route (summed gzip -9 of the route's chunks) plus the lazily loaded effect chunks.
// Usage: node scripts/bundle-size.mjs apps/web [/ /strategy ...]
// Run `pnpm --filter @brandloop/web build` first. Method recorded in docs/features/ui-redesign/bundle-baseline.md.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const [dir, ...routes] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node scripts/bundle-size.mjs <app dir> [routes...]");
  process.exit(1);
}
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const stats = JSON.parse(readFileSync(join(dir, ".next/diagnostics/route-bundle-stats.json"), "utf8"));
const firstLoad = new Set();
for (const s of stats) {
  for (const p of s.firstLoadChunkPaths) firstLoad.add(p);
  if (routes.length && !routes.includes(s.route)) continue;
  let raw = 0;
  let gzip = 0;
  for (const p of s.firstLoadChunkPaths) {
    const buf = readFileSync(join(dir, p));
    raw += buf.length;
    gzip += gz(buf);
  }
  console.log(`${s.route} raw=${raw} gzip=${gzip}`);
}

// Lazy chunks: identified by a string that only the lazily imported module contains.
const markers = {
  // The domAnimation feature bundle is an object literal whose keys survive minification.
  "motion features (domAnimation)": "inView:",
  "dither field": "dither__canvas",
};
const chunkDir = join(dir, ".next/static/chunks");
const files = readdirSync(chunkDir).filter((f) => f.endsWith(".js"));
for (const [name, marker] of Object.entries(markers)) {
  const hits = files
    .map((f) => ({ f, buf: readFileSync(join(chunkDir, f)) }))
    .filter(({ buf }) => buf.includes(marker))
    .map(({ f, buf }) => ({ f, raw: buf.length, gzip: gz(buf), eager: firstLoad.has(`.next/static/chunks/${f}`) }));
  for (const h of hits) console.log(`lazy[${name}] ${h.f} raw=${h.raw} gzip=${h.gzip}${h.eager ? " (IN FIRST LOAD)" : ""}`);
  if (!hits.length) console.log(`lazy[${name}] not found`);
}
