# Bundle baseline (pre-D2)

Task 13 compares the home route against this number. The budget is: home route First Load JS grows by at most 40 KB gzip.

## How it is measured

Next 16.4 with Turbopack does not print a "First Load JS" column in `next build`. It writes
`apps/web/.next/diagnostics/route-bundle-stats.json` instead, listing each route's first-load chunk files and their
uncompressed size. The gzip figure below is the sum of `gzip -9` sizes of those chunk files, computed with:

```js
// node bundle-size.mjs apps/web /
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
const [dir, ...routes] = process.argv.slice(2);
const stats = JSON.parse(readFileSync(join(dir, ".next/diagnostics/route-bundle-stats.json"), "utf8"));
for (const s of stats) {
  if (routes.length && !routes.includes(s.route)) continue;
  let raw = 0, gz = 0;
  for (const p of s.firstLoadChunkPaths) {
    const buf = readFileSync(join(dir, p));
    raw += buf.length; gz += gzipSync(buf, { level: 9 }).length;
  }
  console.log(`${s.route} raw=${raw} gzip=${gz}`);
}
```

Run `pnpm --filter @brandloop/web build` first (needs the root `.env` via `apps/web/.env.local`).

## Baseline

Commit `5083ad3aec3b368299bbad7bca041329726afec0` (`5083ad3`, before any redesign change), Next.js 16.4.2 (Turbopack), Node v24.19.0.

| Route | First Load JS raw | First Load JS gzip |
|-------|------------------:|-------------------:|
| `/` (home) | 866,881 B (846.6 KiB) | 264,361 B (258.2 KiB) |
| `/strategy` | 973,833 B (951.0 KiB) | 294,700 B (287.8 KiB) |
| `/settings` | 851,070 B (831.1 KiB) | 258,565 B (252.5 KiB) |
| `/sign-in/[[...sign-in]]` | 675,704 B (659.9 KiB) | 197,581 B (193.0 KiB) |

## After Task 1 (tokens, fonts, MotionProvider, `/design`)

Measured the same way after `pnpm --filter @brandloop/web build` with the Task 1 changes (motion 14.4.0 in the root layout through
`MotionProvider` with `LazyMotion features={domAnimation}` loaded synchronously; lenis is only a CSS import so far).

| Route | First Load JS gzip | Change from baseline |
|-------|-------------------:|---------------------:|
| `/` (home) | 291,695 B (284.9 KiB) | +27,334 B (+26.7 KiB) |
| `/strategy` | 322,032 B (314.5 KiB) | +27,332 B |
| `/settings` | 285,898 B (279.2 KiB) | +27,333 B |
| `/sign-in/[[...sign-in]]` | 224,836 B (219.6 KiB) | +27,255 B |

The increase is the same on every route because `MotionProvider` sits in the root layout. That is 67% of the 40 KB budget before any
component uses motion. Experiment (not committed): loading the features lazily,
`features={() => import("./features").then((m) => m.default)}`, brings home to 275,773 B gzip (+11,412 B). The cost is that
animations wait for the features chunk, so a Task 13 decision is needed if the budget gets tight.

`/design` is prerendered as a 404 in production (`.next/server/app/design.meta` has `"status": 404`).
