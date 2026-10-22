import sharp from "sharp";

export type LogoPlacement = { x: number; y: number; sizePercent: number };

export const LOGO_DEFAULT: LogoPlacement = { x: 92, y: 92, sizePercent: 8 };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Places the logo with its centre at x%/y% of the image, its width `sizePercent` of the image width (clamped 4..20),
 * then pushes it inside the image edges. A logo too tall for the image is fitted inside. Output is a PNG.
 */
export async function compositeLogo(
  base: Buffer,
  logo: Buffer,
  { x, y, sizePercent }: LogoPlacement,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const meta = await sharp(base).metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) throw new Error("Unreadable base image");
  const targetW = Math.max(1, Math.round((W * clamp(sizePercent, 4, 20)) / 100));
  const resized = await sharp(logo).ensureAlpha().resize({ width: targetW, height: H, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  const lw = resized.info.width, lh = resized.info.height;
  const left = Math.round(clamp((W * clamp(x, 0, 100)) / 100 - lw / 2, 0, W - lw));
  const top = Math.round(clamp((H * clamp(y, 0, 100)) / 100 - lh / 2, 0, H - lh));
  const bytes = await sharp(base).composite([{ input: resized.data, left, top }]).png().toBuffer();
  return { bytes, width: W, height: H };
}
