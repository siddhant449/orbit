/**
 * Test-database guard. Tests, e2e servers and bulk cleanup helpers must only ever touch the isolated test database
 * (TEST_DATABASE_URL, a database whose name ends in `_test`), never the real one in DATABASE_URL.
 *
 * This module never imports the Prisma client, so test configs and setup files can call `routeToTestDatabase()` before
 * anything creates the client. It never prints connection strings.
 */
import { existsSync } from "node:fs";
import path from "node:path";

/** The repo root .env: the nearest directory above `from` that holds pnpm-workspace.yaml. (No import.meta, so
 * Playwright's CommonJS transform can load this file too.) */
export function rootEnvFile(from = process.cwd()): string | null {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return path.join(dir, ".env");
    if (path.dirname(dir) === dir) return null;
  }
}

export class TestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestDatabaseError";
  }
}

/** The database name in a Postgres connection string (`/orbit_test?sslmode=require` -> `orbit_test`), or null. */
export function databaseNameFromUrl(url: string): string | null {
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

export function isTestDatabaseName(name: string | null | undefined): boolean {
  return typeof name === "string" && name.endsWith("_test");
}

/** TEST_DATABASE_URL from `env`, refused unless it is set and names a `_test` database. */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new TestDatabaseError(
      "TEST_DATABASE_URL is not set. Tests run only against the isolated test database (a Postgres database whose " +
        "name ends in _test); add TEST_DATABASE_URL to the repo root .env (see .env.example).",
    );
  }
  const name = databaseNameFromUrl(url);
  if (!isTestDatabaseName(name)) {
    throw new TestDatabaseError(
      `TEST_DATABASE_URL points at database "${name ?? "(unparseable)"}", whose name does not end in _test. ` +
        "Refusing to run tests against it.",
    );
  }
  return url;
}

/**
 * Points this process at the test database: loads the repo root .env (existing variables win), then sets
 * DATABASE_URL to TEST_DATABASE_URL. Throws when TEST_DATABASE_URL is missing or not a `_test` database.
 * Call it before the Prisma client is created.
 */
export function routeToTestDatabase(env: NodeJS.ProcessEnv = process.env, envFile: string | null = rootEnvFile()): string {
  if (envFile && !env.TEST_DATABASE_URL) {
    try {
      process.loadEnvFile(envFile);
    } catch {
      /* no .env file: the variables may be set already */
    }
  }
  const url = resolveTestDatabaseUrl(env);
  env.DATABASE_URL = url;
  return url;
}

/** Throws unless DATABASE_URL in `env` names a `_test` database. Cheap, synchronous; for setup files. */
export function assertTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): void {
  const name = env.DATABASE_URL ? databaseNameFromUrl(env.DATABASE_URL) : null;
  if (!isTestDatabaseName(name)) {
    throw new TestDatabaseError(
      `DATABASE_URL points at database "${name ?? "(unset)"}", not a _test database. Tests must run with ` +
        "DATABASE_URL taken from TEST_DATABASE_URL (the vitest configs and `pnpm dev:e2e` do this).",
    );
  }
}

type RawQueryClient = { $queryRawUnsafe<T = unknown>(query: string): Promise<T> };

const verified = new WeakSet<object>();

/** The database the client is actually connected to (`select current_database()`). */
export async function currentDatabaseName(client: RawQueryClient): Promise<string> {
  const rows = await client.$queryRawUnsafe<{ name: string }[]>("select current_database() as name");
  return rows[0]?.name ?? "";
}

/**
 * Refuses (throws) unless the client is connected to a database whose name ends in `_test`. Every helper that bulk
 * deletes test rows (user_test_* users, " (test)" teams) calls this first. The answer is cached per client.
 */
export async function assertTestDatabase(client: RawQueryClient): Promise<void> {
  if (verified.has(client)) return;
  const name = await currentDatabaseName(client);
  if (!isTestDatabaseName(name)) {
    throw new TestDatabaseError(
      `Refusing to bulk-delete test rows: connected to database "${name}", which is not a _test database.`,
    );
  }
  verified.add(client);
}
