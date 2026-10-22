import sharp from "sharp";
import type { ThemeColours } from "./prompt";

type RGB = [number, number, number];

const toHex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
const fromHex = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
/** WCAG relative luminance of a #RRGGBB colour (0..1). */
export const luminance = (hex: string): number => {
  const [r, g, b] = fromHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
/** WCAG contrast ratio between two #RRGGBB colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const saturation = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/** Moves `fg` toward black or white (whichever contrasts more with `bg`) until it reaches `min`. */
function ensureContrast(fg: RGB, bg: RGB, min: number): RGB {
  const target: RGB = contrastRatio(toHex([0, 0, 0]), toHex(bg)) >= contrastRatio(toHex([255, 255, 255]), toHex(bg)) ? [0, 0, 0] : [255, 255, 255];
  let cur = fg;
  for (let t = 0; t <= 1.0001 && contrastRatio(toHex(cur), toHex(bg)) < min; t += 0.04) cur = mix(fg, target, t);
  return cur;
}

type Cluster = { c: RGB; n: number };

/** Deterministic k-means: seeds are evenly spaced luminance quantiles, so the same pixels always give the same palette. */
function kmeans(pixels: RGB[], k: number): Cluster[] {
  const sorted = [...pixels].sort((p, q) => luminance(toHex(p)) - luminance(toHex(q)) || p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  let centres: RGB[] = Array.from({ length: k }, (_, i) => [...sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) / k) * sorted.length))]!] as RGB);
  let counts: number[] = new Array(k).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const d = dist(p, centres[i]!);
        if (d < bestD) { bestD = d; best = i; }
      }
      const s = sums[best]!;
      s[0]! += p[0]; s[1]! += p[1]; s[2]! += p[2]; s[3]! += 1;
    }
    counts = sums.map((s) => s[3]!);
    centres = sums.map((s, i) => (s[3]! > 0 ? ([s[0]! / s[3]!, s[1]! / s[3]!, s[2]! / s[3]!] as RGB) : centres[i]!));
  }
  return centres.map((c, i) => ({ c, n: counts[i]! })).filter((x) => x.n > 0);
}

/**
 * A brand theme from an image: 64x64 downsample, k-means (k=8), then roles by luminance and saturation. Deterministic
 * and offline. The three text roles are adjusted until they reach WCAG AA (4.5:1) against the background.
 */
export async function extractTheme(bytes: Buffer): Promise<ThemeColours> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(64, 64, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += info.channels) pixels.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  const clusters = kmeans(pixels, 8).sort((a, b) => b.n - a.n);
  const total = pixels.length;

  // Background: the biggest light or dark cluster; otherwise the biggest cluster overall.
  const extreme = clusters.filter((x) => { const l = luminance(toHex(x.c)); return l < 0.06 || l > 0.55; });
  const bg = (extreme[0] ?? clusters[0]!).c;
  const bgIsLight = luminance(toHex(bg)) > 0.3;
  const ink: RGB = bgIsLight ? [10, 10, 11] : [245, 244, 240];

  // Accent: the most saturated cluster that is clearly not the background and covers at least 1% of the image.
  const colourful = clusters
    .filter((x) => x.c !== bg && dist(x.c, bg) > 60 && x.n / total >= 0.01 && saturation(x.c) > 0.25)
    .sort((a, b) => saturation(b.c) * Math.sqrt(b.n) - saturation(a.c) * Math.sqrt(a.n));
  const accent = colourful[0]?.c ?? (bgIsLight ? ([79, 95, 245] as RGB) : ([124, 138, 255] as RGB));
  const second = colourful.find((x) => dist(x.c, accent) > 50)?.c;
  const highlight = second ?? (bgIsLight ? mix(accent, [255, 255, 255], 0.6) : mix(accent, [255, 255, 255], 0.45));

  const headline = ensureContrast(mix(ink, accent, 0.06), bg, 7);
  const body = ensureContrast(mix(ink, bg, 0.22), bg, 4.5);
  const caption = ensureContrast(mix(ink, bg, 0.42), bg, 4.5);
  const line = mix(bg, ink, 0.14);

  const out: ThemeColours = {
    background: toHex(bg),
    accent: toHex(accent),
    headline: toHex(headline),
    bodyText: toHex(body),
    caption: toHex(caption),
    line: toHex(line),
    bar: toHex(accent),
    highlightBar: toHex(highlight),
  };
  if (out.highlightBar === out.bar) out.highlightBar = toHex(mix(accent, ink, 0.35));
  return out;
}
