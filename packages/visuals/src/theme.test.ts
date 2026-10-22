import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { contrastRatio, extractTheme, luminance } from "./theme";

/** A fixture: a background colour with a few coloured blocks, so the result is stable across runs. */
async function fixture(bg: string, blocks: [string, number, number, number, number][]) {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: bg } })
    .composite(blocks.map(([c, left, top, w, h]) => ({ input: { create: { width: w, height: h, channels: 3 as const, background: c } }, left, top })))
    .png()
    .toBuffer();
}
const LIGHT = () => fixture("#F4EFE6", [["#2B50E6", 20, 150, 60, 70], ["#2B50E6", 100, 110, 60, 110], ["#E8B53A", 180, 80, 60, 140], ["#1B1B1F", 20, 20, 200, 20]]);
const DARK = () => fixture("#0B1330", [["#FF7A1A", 20, 150, 60, 70], ["#FF7A1A", 100, 110, 60, 110], ["#6EE7B7", 180, 80, 60, 140], ["#F5F4F0", 20, 20, 200, 20]]);
const SATURATED = () => fixture("#E5198A", [["#FFE600", 20, 120, 120, 100], ["#0A0A0B", 180, 60, 100, 160], ["#00C2FF", 20, 20, 120, 30]]);

const ROLES = ["background", "accent", "headline", "bodyText", "caption", "line", "bar", "highlightBar"] as const;

describe("extractTheme", () => {
  for (const [name, make] of [["light", LIGHT], ["dark", DARK], ["saturated", SATURATED]] as const) {
    it(`${name}: eight #RRGGBB roles, deterministic, text roles meet AA against the background`, async () => {
      const img = await make();
      const a = await extractTheme(img);
      const b = await extractTheme(img);
      expect(a).toEqual(b);
      for (const r of ROLES) expect(a[r], r).toMatch(/^#[0-9A-F]{6}$/);
      for (const r of ["headline", "bodyText", "caption"] as const) {
        expect(contrastRatio(a[r], a.background), `${name} ${r}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(a).toMatchSnapshot();
    });
  }

  it("takes the background from the dominant extreme colour and the accent from the saturated blocks", async () => {
    const light = await extractTheme(await LIGHT());
    expect(luminance(light.background)).toBeGreaterThan(0.6);
    const dark = await extractTheme(await DARK());
    expect(luminance(dark.background)).toBeLessThan(0.1);
    expect(dark.accent).not.toBe(dark.background);
    // light fixture: the blue blocks are the biggest saturated area
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(light.accent.slice(i, i + 2), 16));
    expect(b!).toBeGreaterThan(r!);
    expect(b!).toBeGreaterThan(g!);
  });

  it("bar and highlight bar differ, and the highlight is not the background", async () => {
    for (const make of [LIGHT, DARK, SATURATED]) {
      const t = await extractTheme(await make());
      expect(t.highlightBar).not.toBe(t.bar);
      expect(t.highlightBar).not.toBe(t.background);
    }
  });

  it("handles a flat one-colour image and a transparent PNG without throwing", async () => {
    const flat = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#808080" } }).png().toBuffer();
    const t = await extractTheme(flat);
    expect(contrastRatio(t.bodyText, t.background)).toBeGreaterThanOrEqual(4.5);
    const clear = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    await expect(extractTheme(clear)).resolves.toBeDefined();
  });

  it("rejects bytes that are not an image", async () => {
    await expect(extractTheme(Buffer.from("nope"))).rejects.toThrow();
  });
});
