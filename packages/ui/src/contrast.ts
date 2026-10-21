/** WCAG 2.x contrast helpers for token checks (sRGB, 8-bit channels). */
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

/** Parses `#RGB`, `#RRGGBB` or `rgba(r, g, b, a)` / `rgb(r, g, b)`. */
export function parseColor(value: string): RGBA {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  throw new Error(`Unsupported colour: ${value}`);
}

/** The opaque colour a translucent `fg` paints over an opaque `bg`, rounded to 8-bit channels. */
export function composite(fg: RGBA, bg: RGBA | RGB): RGB {
  const a = fg[3];
  return [0, 1, 2].map((i) => Math.round(fg[i]! * a + bg[i]! * (1 - a))) as RGB;
}

function luminance([r, g, b]: RGB | RGBA): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two opaque colours (strings or channel tuples). */
export function contrastRatio(a: string | RGB | RGBA, b: string | RGB | RGBA): number {
  const la = luminance(typeof a === "string" ? parseColor(a) : a);
  const lb = luminance(typeof b === "string" ? parseColor(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
