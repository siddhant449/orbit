import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: "../../.env" });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Every spec shares one Clerk test user and profile, so spec files must not run concurrently.
  workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
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
    url: "http://localhost:3000/sign-in",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
