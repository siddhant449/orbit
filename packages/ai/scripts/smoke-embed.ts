/**
 * Manual live smoke test: embeds "hello" once (one tiny API call).
 *   pnpm --filter @brandloop/ai smoke:embed
 * Reads OPENAI_API_KEY at runtime; never prints it.
 */
import { createEmbedder, EMBEDDING_DIMENSIONS } from "../src/embed";
import { resolveEmbeddingModel } from "../src/provider";

const redact = (t: string) => t.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set; nothing to smoke test.");
    process.exit(1);
  }
  try {
    const [v] = await createEmbedder().embed(["hello"]);
    console.log({ model: resolveEmbeddingModel(), dimensions: v?.length ?? 0 });
    if (v?.length !== EMBEDDING_DIMENSIONS) process.exit(1);
  } catch (err) {
    console.error(redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    process.exit(1);
  }
}
void main();
