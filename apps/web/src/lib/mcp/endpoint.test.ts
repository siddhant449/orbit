import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
});
// No real Clerk call: the token check is injected in these tests, and metadata reads the key from env.
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ isAuthenticated: false })) }));

import { ensureAccount, listClients, prisma, revokeClient } from "@brandloop/db";
import { E2E_MCP_USER_HEADER, verifyMcpRequest } from "./auth";
import { createMcpEndpoint } from "./handler";
import { authorizationServerMetadata, protectedResourceMetadata } from "./metadata";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLERK = "user_webtest_mcpauth";
const MOCK = { AI_MOCK_MODEL: "1", NODE_ENV: "test" };
// "clerk.example.accounts.dev$" encoded the way Clerk encodes a Frontend API host in a publishable key.
const KEY = `pk_test_${Buffer.from("clerk.example.accounts.dev$").toString("base64")}`;

async function wipe() {
  await assertTestDatabase(prisma);
  const users = { clerkId: { startsWith: CLERK } };
  await prisma.team.deleteMany({ where: { name: { endsWith: " (webtest)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}
beforeAll(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

const initialize = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3500/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
  });

describe("mcp endpoint", () => {
  it("no token: 401 with WWW-Authenticate pointing at the resource metadata", async () => {
    const endpoint = createMcpEndpoint({ auth: { env: {}, verifyToken: async () => undefined } });
    const res = await endpoint(initialize());
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate") ?? "";
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain('resource_metadata="http://localhost:3500/.well-known/oauth-protected-resource"');
  });

  it("an invalid token is also a 401", async () => {
    const endpoint = createMcpEndpoint({ auth: { env: {}, verifyToken: async () => undefined } });
    const res = await endpoint(initialize({ authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
  });

  it("the e2e header is ignored outside mock mode", async () => {
    const acc = await ensureAccount({ clerkId: `${CLERK}_1`, email: "mcpauth1@example.test", firstName: "M", teamNameSuffix: " (webtest)" });
    expect(acc.user.id).toBeTruthy();
    const headers = { [E2E_MCP_USER_HEADER]: `${CLERK}_1` };
    // Production, even with the mock flag on: ignored.
    for (const env of [{ AI_MOCK_MODEL: "1", NODE_ENV: "production" }, { NODE_ENV: "test" }, {}]) {
      const endpoint = createMcpEndpoint({ auth: { env, verifyToken: async () => undefined } });
      expect((await endpoint(initialize(headers))).status).toBe(401);
    }
    // Mock mode: it stands in for a token.
    const mock = createMcpEndpoint({ auth: { env: MOCK, verifyToken: async () => undefined } });
    expect((await mock(initialize(headers))).status).toBe(200);
  });

  it("a verified token for an unknown user, and a revoked client, are refused", async () => {
    const acc = await ensureAccount({ clerkId: `${CLERK}_2`, email: "mcpauth2@example.test", firstName: "M", teamNameSuffix: " (webtest)" });
    const token = (userId: string, clientId: string) => async () => ({ token: "t", clientId, scopes: [], extra: { userId } });
    const req = () => initialize({ authorization: "Bearer t" });
    expect(await verifyMcpRequest(req(), "t", { env: {}, verifyToken: token("user_nobody", "c1") })).toBeUndefined();
    const ok = await verifyMcpRequest(req(), "t", { env: {}, verifyToken: token(`${CLERK}_2`, "c1") });
    expect(ok?.extra).toMatchObject({ userId: acc.user.id });
    const [client] = await listClients(acc.user.id);
    await revokeClient(acc.user.id, client!.id);
    expect(await verifyMcpRequest(req(), "t", { env: {}, verifyToken: token(`${CLERK}_2`, "c1") })).toBeUndefined();
    // A different assistant of the same user is unaffected.
    expect(await verifyMcpRequest(req(), "t", { env: {}, verifyToken: token(`${CLERK}_2`, "c2") })).toBeDefined();
  });

  it("metadata routes return the Clerk issuer", async () => {
    const res = protectedResourceMetadata(new Request("https://orbit.example/.well-known/oauth-protected-resource"), { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: KEY });
    const body = await res.json();
    expect(body.authorization_servers).toEqual(["https://clerk.example.accounts.dev"]);
    expect(body.resource).toBe("https://orbit.example/api/mcp");

    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", KEY);
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      seen.push(String(url));
      return Response.json({ issuer: "https://clerk.example.accounts.dev", registration_endpoint: "https://clerk.example.accounts.dev/oauth/register" });
    });
    const as = await (await authorizationServerMetadata()).json();
    expect(as.issuer).toBe("https://clerk.example.accounts.dev");
    expect(seen[0]).toBe("https://clerk.example.accounts.dev/.well-known/oauth-authorization-server");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
