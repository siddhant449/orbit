import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "./client";
import {
  assertTestDatabase,
  assertTestDatabaseUrl,
  currentDatabaseName,
  databaseNameFromUrl,
  isTestDatabaseName,
  resolveTestDatabaseUrl,
  rootEnvFile,
  TestDatabaseError,
  routeToTestDatabase,
} from "./test-db";

const url = (db: string) => `postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/${db}?sslmode=require`;
const fakeClient = (name: string) => {
  const client = { calls: 0, async $queryRawUnsafe<T>(): Promise<T> { client.calls++; return [{ name }] as T; } };
  return client;
};

describe("databaseNameFromUrl / isTestDatabaseName", () => {
  it("reads the database name from a connection string", () => {
    expect(databaseNameFromUrl(url("orbit_test"))).toBe("orbit_test");
    expect(databaseNameFromUrl(url("orbit"))).toBe("orbit");
    expect(databaseNameFromUrl("postgresql://u:p@host:5432")).toBeNull();
    expect(databaseNameFromUrl("not a url")).toBeNull();
  });

  it("accepts only names ending in _test", () => {
    expect(isTestDatabaseName("orbit_test")).toBe(true);
    expect(isTestDatabaseName("orbit")).toBe(false);
    expect(isTestDatabaseName("orbit_test_copy")).toBe(false);
    expect(isTestDatabaseName("orbittest")).toBe(false);
    expect(isTestDatabaseName(null)).toBe(false);
  });
});

describe("resolveTestDatabaseUrl", () => {
  it("fails fast when TEST_DATABASE_URL is missing or blank", () => {
    expect(() => resolveTestDatabaseUrl({})).toThrow(/TEST_DATABASE_URL is not set/);
    expect(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: "  " })).toThrow(TestDatabaseError);
  });

  it("refuses a database whose name does not end in _test, without printing the URL", () => {
    let message = "";
    try {
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: url("orbit") });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/"orbit".*does not end in _test/);
    expect(message).not.toContain("u:p@");
  });

  it("returns a _test URL", () => {
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: url("orbit_test") })).toBe(url("orbit_test"));
  });
});

describe("rootEnvFile", () => {
  it("finds the workspace root .env from inside a package", () => {
    expect(rootEnvFile(__dirname)).toBe(path.resolve(__dirname, "../../../.env"));
    expect(rootEnvFile("/")).toBeNull();
  });
});

describe("routeToTestDatabase", () => {
  it("replaces DATABASE_URL with TEST_DATABASE_URL", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: url("orbit"), TEST_DATABASE_URL: url("orbit_test") };
    routeToTestDatabase(env, null);
    expect(env.DATABASE_URL).toBe(url("orbit_test"));
  });

  it("leaves DATABASE_URL untouched when it refuses", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: url("orbit"), TEST_DATABASE_URL: url("orbit") };
    expect(() => routeToTestDatabase(env, null)).toThrow(TestDatabaseError);
    expect(env.DATABASE_URL).toBe(url("orbit"));
    expect(() => routeToTestDatabase({ DATABASE_URL: url("orbit") }, null)).toThrow(/TEST_DATABASE_URL is not set/);
  });
});

describe("assertTestDatabaseUrl", () => {
  it("passes only when DATABASE_URL names a _test database", () => {
    expect(() => assertTestDatabaseUrl({ DATABASE_URL: url("orbit_test") })).not.toThrow();
    expect(() => assertTestDatabaseUrl({ DATABASE_URL: url("orbit") })).toThrow(/"orbit", not a _test database/);
    expect(() => assertTestDatabaseUrl({})).toThrow(/"\(unset\)"/);
  });
});

describe("assertTestDatabase (bulk cleanup guard)", () => {
  it("refuses when the connected database is not a _test database", async () => {
    await expect(assertTestDatabase(fakeClient("orbit"))).rejects.toThrow(/Refusing to bulk-delete.*"orbit"/);
  });

  it("passes on a _test database and caches the answer per client", async () => {
    const client = fakeClient("orbit_test");
    await assertTestDatabase(client);
    await assertTestDatabase(client);
    expect(client.calls).toBe(1);
  });

  it("this suite's own Prisma client is connected to a _test database", async () => {
    expect(isTestDatabaseName(await currentDatabaseName(prisma))).toBe(true);
    await expect(assertTestDatabase(prisma)).resolves.toBeUndefined();
    expect(isTestDatabaseName(databaseNameFromUrl(process.env.DATABASE_URL ?? ""))).toBe(true);
  });
});
