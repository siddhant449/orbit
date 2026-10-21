import { defineConfig } from "vitest/config";

// The db package reads DATABASE_URL from the repo root .env.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  /* env may already be set */
}

export default defineConfig({ test: { fileParallelism: false } });
