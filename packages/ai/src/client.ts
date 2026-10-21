import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export class AiUnavailableError extends Error {
  constructor(message = "AI is unavailable: ANTHROPIC_API_KEY is not set.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export type ModelAlias = "generate" | "extract";
export type AiImage = { mediaType: string; base64: string };
type BaseOpts = { model: ModelAlias; system: string; prompt: string; images?: AiImage[] };

export type AiClient = {
  json<T>(opts: BaseOpts & { schema: z.ZodType<T> }): Promise<T>;
  text(opts: BaseOpts): Promise<string>;
};

export function resolveModel(alias: ModelAlias): string {
  return alias === "generate"
    ? (process.env.AI_MODEL_GENERATE ?? "claude-sonnet-5-5")
    : (process.env.AI_MODEL_EXTRACT ?? "claude-haiku-5-5");
}

export type SdkLike = { messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> } };

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function buildContent(prompt: string, images?: AiImage[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = (images ?? []).map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType as ImageMedia, data: img.base64 },
  }));
  blocks.push({ type: "text", text: prompt });
  return blocks;
}

function textOf(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The model response was cut off (max_tokens reached) before it finished.");
  }
  return message.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
}

/**
 * Claude-backed AiClient. Throws AiUnavailableError lazily (on first call)
 * when no key is configured, so constructing it never crashes a keyless server.
 */
export function createClaudeClient(
  apiKey: string | undefined = process.env.ANTHROPIC_API_KEY,
  /** Test seam: supply a fake SDK instead of constructing the real one. */
  sdkFactory: (apiKey: string) => SdkLike = (key) => new Anthropic({ apiKey: key }),
): AiClient {
  let sdk: SdkLike | null = null;
  const getSdk = () => {
    if (!apiKey) throw new AiUnavailableError();
    return (sdk ??= sdkFactory(apiKey));
  };

  return {
    async text({ model, system, prompt, images }) {
      const res = await getSdk().messages.create({
        model: resolveModel(model),
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: buildContent(prompt, images) }],
      });
      return textOf(res);
    },
    async json<T>({ model, system, prompt, images, schema }: BaseOpts & { schema: z.ZodType<T> }) {
      const res = await getSdk().messages.create({
        model: resolveModel(model),
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: buildContent(prompt, images) }],
        output_config: {
          format: {
            type: "json_schema",
            schema: z.toJSONSchema(schema) as Record<string, unknown>,
          },
        },
      });
      const raw = textOf(res);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The model returned invalid JSON.");
      }
      return schema.parse(parsed);
    },
  };
}
