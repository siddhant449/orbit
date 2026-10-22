import { describe, expect, it } from "vitest";
import { devDbNameEnabled, getDevDbNameHandler } from "./dev-db-name";

const client = (name: string) => ({ async $queryRawUnsafe<T>(): Promise<T> { return [{ name }] as T; } });

describe("GET /api/dev/db-name", () => {
  it("is enabled only for AI_MOCK_MODEL=1 outside production", () => {
    expect(devDbNameEnabled({ AI_MOCK_MODEL: "1", NODE_ENV: "development" })).toBe(true);
    expect(devDbNameEnabled({ AI_MOCK_MODEL: "1", NODE_ENV: "production" })).toBe(false);
    expect(devDbNameEnabled({ NODE_ENV: "development" })).toBe(false);
  });

  it("404s in production even with the mock flag", async () => {
    const res = await getDevDbNameHandler(client("orbit_test"), { AI_MOCK_MODEL: "1", NODE_ENV: "production" });
    expect(res.status).toBe(404);
  });

  it("reports the connected database name and whether it is a _test database", async () => {
    const env = { AI_MOCK_MODEL: "1", NODE_ENV: "development" };
    expect(await (await getDevDbNameHandler(client("orbit_test"), env)).json()).toEqual({ database: "orbit_test", isTest: true });
    expect(await (await getDevDbNameHandler(client("orbit"), env)).json()).toEqual({ database: "orbit", isTest: false });
  });
});
