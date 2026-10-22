import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateImage, type ImageModel } from "ai";
import { ProviderError } from "./errors";
import type { EditOptions, GenerateOptions, ImageInput, ImageProvider, ImageResult } from "./provider";

export type OpenAiImageDeps = {
  apiKey: string;
  /** Model used to generate. */
  model: string;
  /** Model used to edit (default: the same). */
  editModel?: string;
  /** Test seams. */
  generate?: typeof generateImage;
  imageModel?: (id: string) => ImageModel;
  /** Operator log line: model and HTTP status only, never the key, the prompt or the response body. */
  log?: (message: string) => void;
};

const bodyOf = (err: APICallError) => (typeof err.responseBody === "string" ? err.responseBody : "");

/** Maps whatever the SDK threw to a ProviderError with fixed, secret-free copy. */
export function mapProviderError(err: unknown, log: (m: string) => void = () => {}): ProviderError {
  if (err instanceof ProviderError) return err;
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    const body = bodyOf(err);
    if (status === 403 && /verif/i.test(body)) {
      log("[visuals] openai: organisation verification is required for this image model (HTTP 403)");
      return new ProviderError("verification_required", false, undefined, status);
    }
    if ((status === 400 || status === 422) && /moderation|safety system|content[_ ]policy|policy_violation|safety/i.test(body)) {
      return new ProviderError("refused", false, undefined, status);
    }
    if (status === 429 || status === 408 || (status !== undefined && status >= 500)) {
      log(`[visuals] openai: HTTP ${status}`);
      return new ProviderError("unavailable", true, undefined, status);
    }
    log(`[visuals] openai: HTTP ${status ?? "?"}`);
    return new ProviderError("unavailable", false, undefined, status);
  }
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") return new ProviderError("timeout", false);
  if (err instanceof TypeError || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(err instanceof Error ? err.message : "")) {
    log("[visuals] openai: network error");
    return new ProviderError("unavailable", true);
  }
  log("[visuals] openai: unexpected error");
  return new ProviderError("unavailable", false);
}

function sniff(bytes: Buffer): ImageInput["mediaType"] | null {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export function openAiImageProvider(deps: OpenAiImageDeps): ImageProvider {
  const run = deps.generate ?? generateImage;
  const openai = createOpenAI({ apiKey: deps.apiKey });
  const modelFor = deps.imageModel ?? ((id: string) => openai.image(id));
  const log = deps.log ?? ((m: string) => console.warn(m));
  const editModel = deps.editModel ?? deps.model;

  async function call(model: string, prompt: Parameters<typeof generateImage>[0]["prompt"], quality: string, size: string | undefined, signal?: AbortSignal): Promise<ImageResult> {
    let result;
    try {
      result = await run({
        model: modelFor(model),
        prompt,
        ...(size ? { size: size as `${number}x${number}` } : {}),
        // We retry at job level (and refund on the final failure); a hidden SDK retry could double the spend.
        maxRetries: 0,
        abortSignal: signal,
        providerOptions: { openai: { quality, moderation: "auto" } },
      });
    } catch (err) {
      throw mapProviderError(err, log);
    }
    const bytes = Buffer.from(result.image.uint8Array);
    const mediaType = sniff(bytes);
    if (!mediaType) throw new ProviderError("bad_output", false);
    return { image: { bytes, mediaType } };
  }

  return {
    id: `openai:${deps.model}`,
    generate(o: GenerateOptions) {
      // References go through the image edit endpoint, which accepts input images.
      const prompt = o.references?.length ? { text: o.prompt, images: o.references.map((r) => r.bytes) } : o.prompt;
      return call(deps.model, prompt, o.quality, o.size, o.abortSignal);
    },
    edit(o: EditOptions) {
      const prompt = { text: o.prompt, images: [o.image.bytes], ...(o.mask ? { mask: o.mask.bytes } : {}) };
      return call(editModel, prompt, o.quality, undefined, o.abortSignal);
    },
  };
}
