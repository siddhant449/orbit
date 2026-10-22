import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ProviderError } from "./errors";
import { mockImageProvider } from "./mock";

describe("mock provider", () => {
  it("returns a valid PNG of the requested size after the delay", async () => {
    const p = mockImageProvider({ delayMs: 30 });
    const t0 = Date.now();
    const { image } = await p.generate({ prompt: "a plant", size: "1024x1536", quality: "low" });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
    expect(image.mediaType).toBe("image/png");
    const meta = await sharp(image.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1024, 1536, "png"]);
    expect(p.id).toBe("mock");
  });

  it("is deterministic per prompt and differs between prompts", async () => {
    const p = mockImageProvider();
    const a = await p.generate({ prompt: "one", size: "1024x1024", quality: "low" });
    const b = await p.generate({ prompt: "one", size: "1024x1024", quality: "low" });
    const c = await p.generate({ prompt: "two", size: "1024x1024", quality: "low" });
    expect(a.image.bytes.equals(b.image.bytes)).toBe(true);
    expect(a.image.bytes.equals(c.image.bytes)).toBe(false);
  });

  it("edit keeps the input size and changes the pixels", async () => {
    const p = mockImageProvider();
    const { image } = await p.generate({ prompt: "base", size: "1024x1024", quality: "low" });
    const edited = await p.edit({ image, prompt: "bigger title", quality: "low" });
    const meta = await sharp(edited.image.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1024, 1024]);
    expect(edited.image.bytes.equals(image.bytes)).toBe(false);
  });

  it("can be told to fail with a provider error code, and honours an aborted signal", async () => {
    const failing = mockImageProvider({ fail: "refused" });
    await expect(failing.generate({ prompt: "x", size: "1024x1024", quality: "low" })).rejects.toMatchObject({ name: "ProviderError", code: "refused", retryable: false });
    await expect(mockImageProvider({ fail: "unavailable" }).edit({ image: { bytes: Buffer.from("x"), mediaType: "image/png" }, prompt: "x", quality: "low" })).rejects.toBeInstanceOf(ProviderError);
    const ac = new AbortController();
    const slow = mockImageProvider({ delayMs: 5_000 }).generate({ prompt: "x", size: "1024x1024", quality: "low", abortSignal: ac.signal });
    ac.abort();
    await expect(slow).rejects.toMatchObject({ code: "timeout" });
  });
});
