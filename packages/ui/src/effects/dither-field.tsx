"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { useReducedMotionPref } from "../motion/use-media";

/** 8 × 8 Bayer matrix, normalised to [0, 1). */
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3,
  35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

export type DitherFieldProps = {
  className?: string;
  /** Cell size in CSS px (dpr is capped at 1: the grain is the look). */
  cell?: number;
  /** Frame rate of the drift. */
  fps?: number;
  /** Ellipse of dot density in unit coordinates of the host box: densest at the centre, dissolving to nothing at the rim. */
  mask?: { cx: number; cy: number; rx: number; ry: number };
  /** Peak dot coverage per ink, 0–1. */
  density?: number;
};

function packColor(css: string): number {
  const m = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return 0;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // ImageData is RGBA bytes; a little-endian Uint32 view reads them as ABGR.
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Two-ink dither field (C4): two slow scalar fields quantised through an 8 × 8 Bayer screen, pink and blue dots on
 * the paper, overprint where both pass. The pointer pulls the two inks a few pixels out of register around it.
 * Canvas 2D at one pixel per cell, scaled up with `image-rendering: pixelated`; paused when off-screen or when the
 * tab is hidden; under reduced motion a static CSS Bayer tile is rendered instead and no canvas is created.
 * Decorative: `aria-hidden`, `pointer-events: none`.
 */
export function DitherField({ className, cell = 3, fps = 24, mask = { cx: 0.5, cy: 0.62, rx: 0.72, ry: 0.6 }, density = 0.42 }: DitherFieldProps) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();
  const [ready, setReady] = useState(false);
  const { cx, cy, rx, ry } = mask;

  useEffect(() => {
    if (reduced) return;
    const el = host.current;
    if (!el) return;
    const canvas = document.createElement("canvas");
    canvas.className = "dither__canvas";
    el.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }

    let w = 0;
    let h = 0;
    let img: ImageData | null = null;
    let buf: Uint32Array | null = null;
    let inkA = 0;
    let inkB = 0;
    let inkAB = 0;
    let px = -1e6;
    let py = -1e6;
    let pointerStrength = 0;
    let visible = true;
    let raf = 0;
    let last = 0;
    let first = true;
    const frameMs = 1000 / fps;
    const reach = 160 / cell;
    const pull = 4 / cell;

    const readColors = () => {
      const cs = getComputedStyle(el);
      inkA = packColor(cs.getPropertyValue("--pink"));
      inkB = packColor(cs.getPropertyValue("--blue"));
      inkAB = packColor(cs.getPropertyValue("--overprint"));
    };
    const resize = () => {
      const r = el.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width / cell));
      h = Math.max(1, Math.floor(r.height / cell));
      canvas.width = w;
      canvas.height = h;
      img = ctx.createImageData(w, h);
      buf = new Uint32Array(img.data.buffer);
    };

    const render = (t: number) => {
      if (!img || !buf) return;
      const time = t / 1000;
      const rect = el.getBoundingClientRect();
      const lx = (px - rect.left) / cell;
      const ly = (py - rect.top) / cell;
      pointerStrength += ((px > -1e5 ? 1 : 0) - pointerStrength) * 0.12;
      const reach2 = reach * reach;
      for (let y = 0; y < h; y++) {
        const v = y / h;
        const dy = (v - cy) / ry;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const u = x / w;
          const dx = (u - cx) / rx;
          const d = dx * dx + dy * dy;
          if (d >= 1) {
            buf[i] = 0;
            continue;
          }
          const m = (1 - d) * (1 - d) * density;
          const pdx = x - lx;
          const pdy = y - ly;
          const q = (pdx * pdx + pdy * pdy) / reach2;
          const k = q < 1 ? (1 - q) * (1 - q) * pointerStrength : 0;
          const xa = x + k * pull;
          const xb = x - k * pull;
          // Two slow, low-frequency screens (periods of 400-600 px) so the Bayer threshold draws halftone gradients,
          // not noise; squaring keeps the dots sparse outside the blob centres.
          const sa = 0.5 + 0.5 * Math.sin(xa * 0.034 + time * 0.21 + 1.3 * Math.sin(y * 0.027 - time * 0.13));
          const sb = 0.5 + 0.5 * Math.sin(y * 0.031 - time * 0.17 + 1.3 * Math.cos(xb * 0.024 + time * 0.11));
          const fa = sa * sa;
          const fb = sb * sb;
          const th = BAYER8[((y & 7) << 3) | (x & 7)]!;
          const thB = th + 0.5 > 1 ? th - 0.5 : th + 0.5;
          const a = fa * m + k * 0.12 > th;
          const b = fb * m + k * 0.12 > thB;
          buf[i] = a && b ? inkAB : a ? inkA : b ? inkB : 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const loop = (t: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (t - last >= frameMs) {
        last = t;
        render(t);
        if (first) {
          first = false;
          setReady(true);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    readColors();
    resize();
    start();

    const ro = new ResizeObserver(() => {
      resize();
      start();
    });
    ro.observe(el);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.02 },
    );
    io.observe(el);
    const mo = new MutationObserver(() => {
      readColors();
      start();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      start();
    };
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget === null) {
        px = -1e6;
        py = -1e6;
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      canvas.remove();
    };
  }, [reduced, cell, fps, cx, cy, rx, ry, density]);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className={cn("dither", reduced && "dither--static", className)}
      data-dither={reduced ? undefined : ""}
      data-ready={ready ? "" : undefined}
    />
  );
}
