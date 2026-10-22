import { createHash } from "node:crypto";
import sharp from "sharp";
import { ProviderError, type ProviderErrorCode } from "./errors";
import type { EditOptions, GenerateOptions, ImageProvider, ImageResult } from "./provider";

export type MockOptions = {
  /** Wait this long before answering, like a slow provider. */
  delayMs?: number;
  /** Fail with this provider error code... */
  fail?: ProviderErrorCode;
  /** ...for the first N calls only (default: every call). */
  failTimes?: number;
};

const RETRYABLE: Record<ProviderErrorCode, boolean> = { unavailable: true, refused: false, verification_required: false, timeout: false, bad_output: false };

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new ProviderError("timeout", false));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ProviderError("timeout", false));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const digest = (s: string) => createHash("sha256").update(s).digest();
const rgb = (d: Buffer, at: number) => ({ r: 120 + (d[at]! % 120), g: 120 + (d[at + 1]! % 120), b: 120 + (d[at + 2]! % 120) });

async function render(prompt: string, width: number, height: number): Promise<Buffer> {
  const d = digest(prompt);
  const bg = rgb(d, 0);
  const blocks = Array.from({ length: 6 }, (_, i) => {
    const w = Math.round(width * (0.3 + (d[3 + i]! % 40) / 100));
    const h = Math.round(height * 0.06);
    return {
      input: { create: { width: w, height: h, channels: 3 as const, background: { ...rgb(d, 10 + i * 3), alpha: 1 } } },
      left: Math.round(width * 0.08),
      top: Math.round(height * (0.12 + i * 0.13)),
    };
  });
  return sharp({ create: { width, height, channels: 3, background: { ...bg, alpha: 1 } } }).composite(blocks).png().toBuffer();
}

/** Deterministic offline provider for tests, e2e and dev: a PNG derived from the prompt hash. Never touches the network. */
export function mockImageProvider(opts: MockOptions = {}): ImageProvider {
  let calls = 0;
  const gate = async (signal?: AbortSignal) => {
    calls += 1;
    await wait(opts.delayMs ?? 0, signal);
    if (opts.fail && calls <= (opts.failTimes ?? Infinity)) throw new ProviderError(opts.fail, RETRYABLE[opts.fail]);
  };
  return {
    id: "mock",
    async generate(o: GenerateOptions): Promise<ImageResult> {
      await gate(o.abortSignal);
      const [w, h] = o.size.split("x").map(Number) as [number, number];
      return { image: { bytes: await render(o.prompt, w, h), mediaType: "image/png" } };
    },
    async edit(o: EditOptions): Promise<ImageResult> {
      await gate(o.abortSignal);
      const base = sharp(o.image.bytes);
      const { width, height } = await base.metadata();
      if (!width || !height) throw new ProviderError("bad_output", false);
      const d = digest(`edit:${o.prompt}`);
      const bar = { create: { width, height: Math.max(8, Math.round(height * 0.05)), channels: 3 as const, background: { ...rgb(d, 0), alpha: 1 } } };
      return { image: { bytes: await base.composite([{ input: bar, left: 0, top: 0 }]).png().toBuffer(), mediaType: "image/png" } };
    },
  };
}
