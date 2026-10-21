import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: "../../.env" });

// A worktree runs its own dev server on another port: PLAYWRIGHT_BASE_URL=http://localhost:3100.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Every spec shares one Clerk test user and profile, so spec files must not run concurrently.
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
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
    command: "pnpm dev",
    url: `${baseURL}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
