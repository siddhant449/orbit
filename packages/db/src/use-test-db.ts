// Side-effect import for scripts that create and delete test rows (smoke scripts, e2e seeding): import it FIRST, before
// anything that loads the Prisma client, and the script runs against TEST_DATABASE_URL or refuses to start.
import { routeToTestDatabase } from "./test-db";

routeToTestDatabase();
