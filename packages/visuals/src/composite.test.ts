import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { compositeLogo } from "./composite";

const base = (w = 1080, h = 1350) => sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } }).png().toBuffer();
const red = (w = 200, h = 100) => sharp({ create: { width: w, height: h, channels: 4, background: "#ff0000" } }).png().toBuffer();

/** Bounding box of the pure-red pixels. */
async function redBox(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, W: info.width, H: info.height };
}

describe("compositeLogo", () => {
  it("logo at 92/92/8 on 1080x1350 sits inside the image (clamped), 8% wide", async () => {
    const out = await compositeLogo(await base(), await red(), { x: 92, y: 92, sizePercent: 8 });
    expect([out.width, out.height]).toEqual([1080, 1350]);
    const b = await redBox(out.bytes);
    expect(b.w).toBe(86);
    expect(b.x1).toBeLessThanOrEqual(1079);
    expect(b.y1).toBeLessThanOrEqual(1349);
    expect(b.x0).toBeGreaterThan(900);
    expect(b.y0).toBeGreaterThan(1200);
  });

  it("centres the logo on x%/y% when there is room", async () => {
    const b = await redBox((await compositeLogo(await base(), await red(), { x: 50, y: 50, sizePercent: 10 })).bytes);
    expect(Math.abs((b.x0 + b.x1) / 2 - 540)).toBeLessThanOrEqual(1);
    expect(Math.abs((b.y0 + b.y1) / 2 - 675)).toBeLessThanOrEqual(1);
    expect(b.w).toBe(108);
  });

  it("clamps the size between 4% and 20% and the position inside the image", async () => {
    expect((await redBox((await compositeLogo(await base(), await red(), { x: 50, y: 50, sizePercent: 1 })).bytes)).w).toBe(43);
    expect((await redBox((await compositeLogo(await base(), await red(), { x: 50, y: 50, sizePercent: 90 })).bytes)).w).toBe(216);
    const corner = await redBox((await compositeLogo(await base(), await red(), { x: -40, y: 500, sizePercent: 8 })).bytes);
    expect([corner.x0, corner.y0]).toEqual([0, 1350 - corner.h]);
  });

  it("a tall logo is fitted inside the image", async () => {
    const b = await redBox((await compositeLogo(await base(300, 300), await red(40, 900), { x: 50, y: 50, sizePercent: 20 })).bytes);
    expect(b.h).toBeLessThanOrEqual(300);
    expect(b.x0).toBeGreaterThanOrEqual(0);
  });

  it("keeps a transparent logo's transparency and returns PNG", async () => {
    const logo = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await compositeLogo(await base(), logo, { x: 50, y: 50, sizePercent: 10 });
    expect((await sharp(out.bytes).metadata()).format).toBe("png");
    const { data, info } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    const centre = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    expect([...data.slice(centre, centre + 3)]).toEqual([255, 255, 255]); // the transparent logo drew nothing
  });

  it("rejects non-image bytes", async () => {
    await expect(compositeLogo(await base(), Buffer.from("x"), { x: 50, y: 50, sizePercent: 8 })).rejects.toThrow();
  });
});
