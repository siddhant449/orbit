import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";
import type { FinishReason, LanguageModel, ModelMessage } from "ai";
import { z } from "zod";
import { getModel, type ModelAlias } from "./provider";

export { resolveModel, type ModelAlias } from "./provider";

export class AiUnavailableError extends Error {
  constructor(message = "AI is unavailable: OPENAI_API_KEY is not set.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export type AiImage = { mediaType: string; base64: string };
type BaseOpts = {
  model: ModelAlias;
  system: string;
  prompt: string;
  images?: AiImage[];
  /** Cancels the request (a stopped chat turn or its deadline); the call rejects with the abort error. */
  abortSignal?: AbortSignal;
};

export type AiClient = {
  json<T>(opts: BaseOpts & { schema: z.ZodType<T> }): Promise<T>;
  text(opts: BaseOpts): Promise<string>;
};

/** Test seam: supply fake language models instead of the real OpenAI ones. */
export type AiClientDeps = { model?: (alias: ModelAlias) => LanguageModel };

const MAX_OUTPUT_TOKENS = 16000;

function buildMessages(prompt: string, images?: AiImage[]): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        ...(images ?? []).map((img) => ({
          type: "file" as const,
          mediaType: img.mediaType,
          data: { type: "data" as const, data: img.base64 },
        })),
        { type: "text" as const, text: prompt },
      ],
    },
  ];
}

const DECLINED_MESSAGE = "The model declined this request.";

/** Turns refusals and token-limit truncation into clear errors, before any parsing. */
function assertCompleted(reason: FinishReason | undefined): void {
  if (reason === "content-filter") {
    throw new Error(DECLINED_MESSAGE);
  }
  if (reason === "length") {
    throw new Error("The model response was cut off (output limit reached) before it finished.");
  }
}

/**
 * OpenAI structured-output refusals arrive as a `{ "type": "refusal" }` content
 * part, which @ai-sdk/openai's Responses schema does not accept. The SDK then
 * throws APICallError("Invalid JSON response") carrying the raw response body.
 */
function isOpenAiRefusal(err: unknown): boolean {
  return (
    APICallError.isInstance(err) &&
    typeof err.responseBody === "string" &&
    /"type"\s*:\s*"refusal"/.test(err.responseBody)
  );
}

/** Rethrows an AI SDK failure as the clearest error we can name; never returns. */
function rethrowClearly(err: unknown): never {
  if (isOpenAiRefusal(err)) throw new Error(DECLINED_MESSAGE, { cause: err });
  // A cut-off or filtered reply can still reach the parser and fail there;
  // report the real cause instead of a parse error.
  if (NoObjectGeneratedError.isInstance(err)) assertCompleted(err.finishReason);
  throw err;
}

/**
 * OpenAI-backed AiClient on the Vercel AI SDK. Throws AiUnavailableError lazily
 * (on first call) when no key is configured, so constructing it never crashes
 * a keyless server.
 */
export function createAiClient(
  apiKey: string | undefined = process.env.OPENAI_API_KEY,
  deps: AiClientDeps = {},
): AiClient {
  const modelFor = (alias: ModelAlias): LanguageModel => {
    if (!apiKey) throw new AiUnavailableError();
    return deps.model ? deps.model(alias) : getModel(alias, apiKey);
  };

  return {
    async text({ model, system, prompt, images, abortSignal }) {
      let result;
      try {
        result = await generateText({
          model: modelFor(model),
          instructions: system,
          messages: buildMessages(prompt, images),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal,
        });
      } catch (err) {
        rethrowClearly(err);
      }
      assertCompleted(result.finishReason);
      return result.text.trim();
    },
    async json<T>({ model, system, prompt, images, schema, abortSignal }: BaseOpts & { schema: z.ZodType<T> }) {
      let result;
      try {
        result = await generateText({
          model: modelFor(model),
          instructions: system,
          messages: buildMessages(prompt, images),
          output: Output.object({ schema }),
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal,
        });
      } catch (err) {
        rethrowClearly(err);
      }
      assertCompleted(result.finishReason);
      return result.output;
    },
  };
}

/** @deprecated Use createAiClient. Kept so existing imports keep working. */
export const createClaudeClient = createAiClient;
