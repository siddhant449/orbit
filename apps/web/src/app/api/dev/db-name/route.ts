import { prisma } from "@brandloop/db";
import { getDevDbNameHandler } from "@/lib/dev-db-name";

// Dev-only (AI_MOCK_MODEL=1, never production): which database this server uses. See e2e/global.setup.ts.
export function GET() {
  return getDevDbNameHandler(prisma);
}
