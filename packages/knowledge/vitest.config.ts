import { defineConfig } from "vitest/config";
import { routeToTestDatabase } from "../db/src/test-db.ts";

// Tests run only against the isolated test database: DATABASE_URL is replaced by TEST_DATABASE_URL (name must end in
// _test) before any worker starts, and the db package's setup file checks it again inside each worker.
routeToTestDatabase();

export default defineConfig({
  test: {
    fileParallelism: false,
    setupFiles: ["../db/src/vitest-setup.ts"],
    // Neon (Singapore) round trips are slow; DB-backed tests get more time, assertions are unchanged.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
