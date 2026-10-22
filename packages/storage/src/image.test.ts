import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normaliseImage } from "./image";

async function withExif(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#336699" } })
    .withExif({ IFD0: { Copyright: "secret", Artist: "someone" } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

describe("normaliseImage", () => {
  it("strips EXIF and caps the longest side at 4096", async () => {
    const input = await withExif(6000, 1000);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await normaliseImage(input);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(4096);
    expect(out.contentType).toBe("image/jpeg");
    expect([out.width, out.height]).toEqual([meta.width, meta.height]);
  });

  it("applies the EXIF rotation before stripping it", async () => {
    const out = await normaliseImage(await withExif(200, 100));
    expect([out.width, out.height]).toEqual([100, 200]);
  });

  it("converts format and honours maxSide", async () => {
    const png = await sharp({ create: { width: 800, height: 400, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const out = await normaliseImage(png, { maxSide: 400, format: "webp" });
    expect(out.contentType).toBe("image/webp");
    expect([out.width, out.height]).toEqual([400, 200]);
  });

  it("does not enlarge small images and rejects non-images", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    expect((await normaliseImage(png)).width).toBe(10);
    await expect(normaliseImage(Buffer.from("not an image"))).rejects.toThrow();
  });
});
