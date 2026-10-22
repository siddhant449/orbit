import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropToAspect, sizeFor } from "./aspect";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();

describe("aspect", () => {
  it("maps each aspect to a provider size and output size", () => {
    expect(sizeFor("PORTRAIT_4_5")).toEqual({ provider: "1024x1536", width: 1080, height: 1350 });
    expect(sizeFor("PORTRAIT_2_3")).toEqual({ provider: "1024x1536", width: 1024, height: 1536 });
    expect(sizeFor("SQUARE")).toEqual({ provider: "1024x1024", width: 1080, height: 1080 });
    expect(sizeFor("LANDSCAPE_3_2")).toEqual({ provider: "1536x1024", width: 1536, height: 1024 });
  });

  it("cropToAspect: 1024x1536 -> 1080x1350 for 4:5, PNG, no metadata", async () => {
    const withExif = await sharp(await png(1024, 1536)).withExif({ IFD0: { Copyright: "x" } }).jpeg().toBuffer();
    const out = await cropToAspect(withExif, "PORTRAIT_4_5");
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1080, 1350, "png"]);
    expect([out.width, out.height]).toEqual([1080, 1350]);
    expect(meta.exif).toBeUndefined();
  });

  it("covers the target from a different source ratio (centre crop)", async () => {
    const left = await sharp({ create: { width: 512, height: 1024, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const right = await sharp({ create: { width: 512, height: 1024, channels: 3, background: "#0000ff" } }).png().toBuffer();
    const mid = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#00ff00" } })
      .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 512, top: 0 }]).png().toBuffer();
    const out = await cropToAspect(mid, "SQUARE");
    expect([out.width, out.height]).toEqual([1080, 1080]);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(cropToAspect(Buffer.from("nope"), "SQUARE")).rejects.toThrow();
  });
});
