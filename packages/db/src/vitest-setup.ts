// Vitest setup file for every package whose tests can reach Prisma: runs in each worker before any test file is
// imported, so the Prisma client is only ever created against the test database (TEST_DATABASE_URL, name ending _test).
import { assertTestDatabaseUrl, routeToTestDatabase } from "./test-db";

routeToTestDatabase();
assertTestDatabaseUrl();
