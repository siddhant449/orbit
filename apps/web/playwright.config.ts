import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: "../../.env" });

/**
 * e2e runs only against the isolated test database (TEST_DATABASE_URL, name ending _test), never the real one:
 *
 *   pnpm --filter @brandloop/web dev:e2e           # next dev on :3100, DATABASE_URL <- TEST_DATABASE_URL, AI_MOCK_MODEL=1
 *   pnpm --filter @brandloop/web e2e               # serial suite against http://localhost:3100
 *
 * Without a running server the webServer below starts `dev:e2e` itself. Another port: PORT=3200 for dev:e2e and
 * PLAYWRIGHT_BASE_URL=http://localhost:3200 here. global.setup.ts asks the server which database it uses
 * (GET /api/dev/db-name) and stops the run unless it is a _test database; it then seeds the presets and resets the
 * Clerk test user. e2e/lock.ts allows one runner at a time (all specs share that user).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
// The e2e server always runs the scripted mock model (dev:e2e sets it; global.setup's /api/dev/db-name probe only
// answers in mock mode), so the mock-only specs run too.
process.env.AI_MOCK_MODEL ??= "1";

export default defineConfig({
  testDir: "./e2e",
  // Artifacts go one level down so test-results/.e2e.lock survives Playwright's output cleanup.
  outputDir: "./test-results/output",
  globalSetup: "./e2e/lock.ts",
  fullyParallel: false,
  // Every spec shares one Clerk test user and profile, so spec files must not run concurrently.
  workers: 1,
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Orbit's app default is Dark (system §3). Specs choose day or night with `emulateMedia`, so every context starts on
    // the "Auto" setting; design.spec clears this to check the real default.
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "orbit-theme", value: "system" }] }],
    },
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      // Headless Chromium on Linux rounds glyph advances to whole pixels; without hinting the screenshots match real browsers.
      use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--font-render-hinting=none"] } },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev:e2e",
    env: { PORT: new URL(baseURL).port || "3100" },
    url: `${baseURL}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
