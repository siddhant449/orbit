// The e2e app server: `next dev` against the isolated test database, with the offline mock model.
//   pnpm --filter @brandloop/web dev:e2e            # port 3100 (PORT=… to change)
// DATABASE_URL is replaced by TEST_DATABASE_URL from the repo root .env (its database name must end in _test, or this
// refuses to start). Process env wins over Next's own .env loading, so the real DATABASE_URL never reaches the app.
// Never prints connection strings.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { databaseNameFromUrl, routeToTestDatabase } from "../../../packages/db/src/test-db.ts";

const port = process.env.PORT ?? "3100";
let url;
try {
  url = routeToTestDatabase();
} catch (err) {
  console.error(`dev:e2e: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: url,
  AI_MOCK_MODEL: "1",
  APP_URL: process.env.APP_URL ?? `http://localhost:${port}`,
  // e2e never spends Deepgram credits and never publishes to LinkedIn.
  DEEPGRAM_ENABLED: "false",
  // e2e never calls a live image model: the mock provider, files on local disk, jobs in-process.
  VISUALS_PROVIDER: "mock",
  VISUALS_ENABLED: "1",
  STORAGE_DRIVER: "local",
  JOBS_DRIVER: "local",
  LINKEDIN_PUBLISH_ENABLED: "",
};
console.log(`dev:e2e: next dev on :${port}, database ${databaseNameFromUrl(url)}, AI_MOCK_MODEL=1`);

const next = fileURLToPath(new URL("../node_modules/.bin/next", import.meta.url));
const child = spawn(next, ["dev", "-p", port], { env, stdio: "inherit", cwd: fileURLToPath(new URL("..", import.meta.url)) });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
