import sharp from "sharp";

export type VisualAspectName = "SQUARE" | "PORTRAIT_4_5" | "PORTRAIT_2_3" | "LANDSCAPE_3_2";
export type ProviderSize = "1024x1024" | "1024x1536" | "1536x1024";

const SIZES: Record<VisualAspectName, { provider: ProviderSize; width: number; height: number }> = {
  PORTRAIT_4_5: { provider: "1024x1536", width: 1080, height: 1350 },
  PORTRAIT_2_3: { provider: "1024x1536", width: 1024, height: 1536 },
  SQUARE: { provider: "1024x1024", width: 1080, height: 1080 },
  LANDSCAPE_3_2: { provider: "1536x1024", width: 1536, height: 1024 },
};

/** What to ask the provider for, and the final output size, for an aspect (design §7.2). */
export function sizeFor(aspect: VisualAspectName) {
  return { ...SIZES[aspect] };
}

/** Centre cover-crops to the aspect's output size and re-encodes as PNG with no metadata. Throws on non-image bytes. */
export async function cropToAspect(bytes: Buffer, aspect: VisualAspectName): Promise<{ bytes: Buffer; width: number; height: number }> {
  const { width, height } = SIZES[aspect];
  const out = await sharp(bytes, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width, height, fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  return { bytes: out, width, height };
}
