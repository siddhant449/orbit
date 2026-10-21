# Bundle baseline (pre-D2)

Task 13 compares the home route against this number. The budget is: home route First Load JS grows by at most 40 KB gzip
(raised to **90 KB gzip eagerly** for the cinematic direction, ruling U10; lazy chunks are listed beside the first-load figure).

## How it is measured

Next 16.4 with Turbopack does not print a "First Load JS" column in `next build`. It writes
`apps/web/.next/diagnostics/route-bundle-stats.json` instead, listing each route's first-load chunk files and their
uncompressed size. The gzip figure below is the sum of `gzip -9` sizes of those chunk files, computed with:

```js
// node scripts/bundle-size.mjs apps/web /   (checked in; also lists the lazy chunks)
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

## After Task R2★ (shell + home: kinetic type, landing, tickets, dither field, Lenis, lazy motion features)

Measured with `node scripts/bundle-size.mjs apps/web / /strategy /settings "/sign-in/[[...sign-in]]"` after
`pnpm --filter @brandloop/web build` (Next.js 16.4.2, Turbopack), with the custom cursor already removed; the final
avatar and label fixes that followed change markup only.

| Route | First Load JS gzip | Change from baseline | Change from Task 1 |
|-------|-------------------:|---------------------:|-------------------:|
| `/` (home) | 320,390 B (312.9 KiB) | **+56,029 B (+54.7 KiB)**, within the 90 KB budget | +28,695 B |
| `/strategy` | 349,078 B | +54,378 B | +27,046 B |
| `/settings` | 312,943 B | +54,378 B | +27,045 B |
| `/sign-in/[[...sign-in]]` | 259,102 B | +61,521 B | +34,266 B |

Lazy chunks (not in any route's first load), gzip -9:

| Chunk | What | raw | gzip | Loaded |
|-------|------|----:|-----:|--------|
| `3pktomc-a023p.js` | `DitherField` (Canvas 2D two-ink field, `@brandloop/ui/effects`) | 3,145 B | 1,766 B | home, after first paint (`next/dynamic`, `ssr: false`, idle callback) |
| `349d1vbvyhych.js` | `packages/ui/src/motion/features.ts` (the `domAnimation` bundle entry, ruling U7) | 239 B | 209 B | app root, after hydration through `LazyMotion features={() => import(...)}` |

Honest note on U7: the features module is split (the 209 B stub above), but Turbopack co-locates framer-motion's
feature implementations (animation, exit, gestures, in-view, the DOM renderer) in the eager framer-motion chunk
`1uuop-i60pxde.js` (85,441 B raw / 31,014 B gzip), because other eager modules import from the same package graph
(`m`, `AnimatePresence`, `frame`, `useReducedMotion`). The lazy import therefore costs nothing but also saves nothing
with Turbopack 16.4.2; Task 1's 16 KB experiment did not hold once `m` components were in the eager graph. The custom
cursor chunk that existed during the task was removed with the cursor (user decision 2026-10-21).

The sign-in route grew more than the app routes (+34 KB vs Task 1) although it renders no shell: the root layout
imports `MotionProvider` from the `@brandloop/ui` barrel, which now also exports `SmoothScroll` (`lenis/react` and
`lenis`) and `Reveal`; `lenis` carries no `sideEffects: false`, so it is retained. Suggested follow-up: import the
provider through a `@brandloop/ui/motion` subpath export so auth pages do not pay for Lenis.

## After the Drafting table rollout (same task, every screen re-themed)

Measured the same way after `pnpm --filter @brandloop/web build` with the riso devices removed (no dither field, no grain,
no colour plates), `MotionProvider` imported through `@brandloop/ui/motion` and Lenis / `Reveal` through
`@brandloop/ui/scroll`.

| Route | First Load JS gzip | Change from baseline | Change from the R2 showpiece build |
|-------|-------------------:|---------------------:|-----------------------------------:|
| `/` (home) | 320,948 B (313.4 KiB) | **+56,587 B (+55.3 KiB)**, within the 90 KB budget | +558 B |
| `/strategy` | 351,340 B | +56,640 B | +2,262 B (`CountUp`) |
| `/settings` | 315,124 B | +56,559 B | +2,181 B |
| `/sign-in/[[...sign-in]]` | 220,521 B | +22,940 B | **−38,581 B** (the subpath import keeps Lenis and the motion components off the auth pages; now below Task 1's 224,836 B) |

Lazy chunks: only the `features.ts` stub remains (`349d1vbvyhych.js`, 239 B raw / 209 B gzip); the dither chunk is gone
with the component. The framer-motion feature implementations stay in the eager framer-motion chunk as noted above.

## After the build fix (B1: upload store and parse worker no longer trace the whole project)

`pnpm --filter @brandloop/web build` failed before this fix, so there was no comparable figure from the builds just before it.
Measured with `node scripts/bundle-size.mjs apps/web / "/chat/[id]"` after a clean build (`.next` removed first) on top of
`50e4cf6`, Next.js 16.4.2 (Turbopack), Node v24.19.0. The fix is server-only, so client first-load JS is unaffected by it.

| Route | First Load JS raw | First Load JS gzip | Change from baseline |
|-------|------------------:|-------------------:|---------------------:|
| `/` (home) | 1,083,932 B (1,058.5 KiB) | 339,953 B (332.0 KiB) | +75,592 B (+73.8 KiB), within the 90 KB budget |
| `/chat/[id]` | 1,571,729 B (1,534.9 KiB) | 470,630 B (459.6 KiB) | no earlier figure |

The script flags the motion `features.ts` chunk (`2_hoau_sgzhkm.js`, 26,483 B raw / 8,061 B gzip) as part of first load.
