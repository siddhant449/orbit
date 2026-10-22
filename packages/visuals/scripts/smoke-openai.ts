// One live check of the OpenAI image provider. Prints the model id, elapsed ms and byte count only (never the key, the
// prompt result or any URL) and writes nothing to storage.
//   pnpm --filter @brandloop/visuals smoke:openai          one 1024x1024 low-quality generation
//   pnpm --filter @brandloop/visuals smoke:openai edit     one low-quality edit of a locally made mock image
// If verification is required, it says so and stops: never retried.
import { createImageProvider } from "../src/provider";
import { mockImageProvider } from "../src/mock";
import { ProviderError } from "../src/errors";

async function main() {
  const mode = process.argv[2] === "edit" ? "edit" : "generate";
  const provider = createImageProvider({ ...process.env, VISUALS_PROVIDER: "openai", NODE_ENV: "development" });
  const started = Date.now();
  try {
    if (mode === "generate") {
      const { image } = await provider.generate({ prompt: "a flat illustration of a desk plant, no text", size: "1024x1024", quality: "low" });
      console.log(`generate ok: ${provider.id}, ${Date.now() - started} ms, ${image.bytes.length} bytes, ${image.mediaType}`);
    } else {
      const base = await mockImageProvider().generate({ prompt: "base", size: "1024x1024", quality: "low" });
      const { image } = await provider.edit({ image: base.image, prompt: "Make the top bar green. Keep everything else the same.", quality: "low" });
      console.log(`edit ok: ${provider.id}, ${Date.now() - started} ms, ${image.bytes.length} bytes, ${image.mediaType}`);
    }
  } catch (err) {
    if (err instanceof ProviderError) {
      console.log(`${mode} failed: code=${err.code} retryable=${err.retryable} status=${err.status ?? "-"} after ${Date.now() - started} ms`);
      if (err.code === "verification_required") console.log("OpenAI organisation verification is required for this model. Not retrying.");
    } else {
      console.log(`${mode} failed: ${err instanceof Error ? err.name : "unknown"}`);
    }
    process.exitCode = 1;
  }
}
void main();
