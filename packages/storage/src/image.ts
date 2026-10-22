import sharp from "sharp";

export type NormaliseOpts = { maxSide?: number; format?: "png" | "jpeg" | "webp" };
export type NormalisedImage = { bytes: Buffer; contentType: string; width: number; height: number };

const TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;

/**
 * Re-encodes an image: applies the EXIF rotation, drops every metadata block (EXIF/GPS, ICC, XMP), caps the longest
 * side and never enlarges. Throws on bytes sharp cannot decode. Keeps the input format unless one is requested.
 */
export async function normaliseImage(input: Buffer, opts: NormaliseOpts = {}): Promise<NormalisedImage> {
  const maxSide = opts.maxSide ?? 4096;
  const src = sharp(input, { animated: true, limitInputPixels: 80_000_000 });
  const meta = await src.metadata();
  const detected = meta.format;
  if (!detected || !(detected in TYPES)) throw new Error("Unsupported image format");
  const format = opts.format ?? (detected as keyof typeof TYPES);

  let pipeline = src.rotate().resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
  pipeline =
    format === "png" ? pipeline.png() : format === "jpeg" ? pipeline.jpeg({ quality: 90, mozjpeg: true }) : format === "webp" ? pipeline.webp({ quality: 90 }) : pipeline.gif();
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const height = info.pageHeight ?? info.height;
  return { bytes: data, contentType: TYPES[format], width: info.width, height };
}

/** Pixel size of an image (EXIF-oriented), or null when sharp cannot read it. */
export async function imageSize(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const m = await sharp(bytes).metadata();
    if (!m.width || !m.height) return null;
    const swap = (m.orientation ?? 1) >= 5;
    const height = m.pageHeight ?? m.height;
    return swap ? { width: height, height: m.width } : { width: m.width, height };
  } catch {
    return null;
  }
}
