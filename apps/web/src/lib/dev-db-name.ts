import { currentDatabaseName, isTestDatabaseName } from "@brandloop/db/test-db";

type Client = Parameters<typeof currentDatabaseName>[0];

/** On only for the offline e2e server: AI_MOCK_MODEL=1 outside production. Production always 404s. */
export function devDbNameEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AI_MOCK_MODEL === "1" && env.NODE_ENV !== "production";
}

/**
 * GET /api/dev/db-name: the name of the database this server is connected to, so the e2e global setup can refuse to
 * run against anything but the isolated `_test` database. Returns the name only, never the connection string.
 */
export async function getDevDbNameHandler(client: Client, env: Record<string, string | undefined> = process.env) {
  if (!devDbNameEnabled(env)) return new Response("Not found", { status: 404 });
  const database = await currentDatabaseName(client);
  return Response.json({ database, isTest: isTestDatabaseName(database) }, { headers: { "Cache-Control": "no-store" } });
}
