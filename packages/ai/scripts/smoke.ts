/**
 * Manual live smoke test for the AI layer. NOT run by any test suite: it makes
 * one real, tiny API call per model alias and spends a few tokens.
 *
 *   pnpm --filter @brandloop/ai smoke
 *
 * Reads OPENAI_API_KEY from the environment at runtime (the smoke script loads
 * the repo .env) and prints only the parsed result and the model ID, never the key.
 */
import { z } from "zod";
import { createAiClient, resolveModel, type ModelAlias } from "../src/client";

const schema = z.object({ ok: z.boolean(), word: z.string() });

// `*` is in the class so masked keys such as "sk-proj-****abcd" are fully redacted.
const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set; nothing to smoke test.");
    process.exit(1);
  }
  const client = createAiClient();
  let failed = false;
  for (const alias of ["generate", "extract"] as const satisfies ModelAlias[]) {
    const modelId = resolveModel(alias);
    try {
      const result = await client.json({
        model: alias,
        system: "You are a test fixture. Answer with the requested JSON only.",
        prompt: 'Return ok=true and word="ping".',
        schema,
      });
      console.log(`[${alias}] ${modelId} ->`, JSON.stringify(result));
    } catch (err) {
      failed = true;
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[${alias}] ${modelId} FAILED -> ${redact(message)}`);
    }
  }
  if (failed) process.exit(1);
}

void main();
