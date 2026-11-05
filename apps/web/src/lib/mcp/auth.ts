import { prisma, touchClient } from "@brandloop/db";
import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { isMockMode } from "@/lib/chat-deps";

/**
 * Test-only stand-in for an OAuth access token: the mock server (AI_MOCK_MODEL=1, never production) reads the Clerk user
 * id from this header, the same rule as the `orbit-e2e-admin` cookie. Anywhere else the header is ignored.
 */
export const E2E_MCP_USER_HEADER = "x-orbit-e2e-mcp-user";
/** Optional, mock only: which assistant (OAuth client) the call comes from. Defaults to one test client. */
export const E2E_MCP_CLIENT_HEADER = "x-orbit-e2e-mcp-client";

export type McpAuthDeps = {
  env?: Record<string, string | undefined>;
  /** Verifies a Clerk-issued OAuth access token. Returns undefined for a missing or invalid one. */
  verifyToken?: (bearer: string | undefined) => Promise<AuthInfo | undefined>;
};

/** The assistant's name for the Connected assistants list. The token carries only a client id, so the user agent is the best signal. */
export function assistantName(userAgent: string | null): string {
  if (userAgent && /openai|chatgpt/i.test(userAgent)) return "ChatGPT";
  if (userAgent && /codex/i.test(userAgent)) return "Codex";
  return "AI assistant";
}

async function verifyClerkOAuth(bearer: string | undefined): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  // acceptsToken makes Clerk verify the bearer as an OAuth access token it issued (signature, expiry, revocation).
  const authObject = await auth({ acceptsToken: "oauth_token" });
  return verifyClerkToken(authObject, bearer) as AuthInfo | undefined;
}

/**
 * Who is calling, or undefined (the endpoint answers 401). The token must be a Clerk OAuth access token of a user who has
 * an Orbit account, from an assistant the user has not disconnected. `extra.userId` is Orbit's user id.
 */
export async function verifyMcpRequest(req: Request, bearer: string | undefined, deps: McpAuthDeps = {}): Promise<AuthInfo | undefined> {
  const env = deps.env ?? process.env;
  let clerkId: string;
  let clientId: string;
  let scopes: string[] = [];

  const stand = isMockMode(env) ? req.headers.get(E2E_MCP_USER_HEADER) : null;
  if (stand) {
    clerkId = stand;
    clientId = req.headers.get(E2E_MCP_CLIENT_HEADER) || "e2e-mcp-client";
  } else {
    const info = await (deps.verifyToken ?? verifyClerkOAuth)(bearer);
    const fromToken = info?.extra?.userId;
    if (!info || typeof fromToken !== "string") return undefined;
    clerkId = fromToken;
    clientId = info.clientId;
    scopes = info.scopes;
  }

  const user = await prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
  if (!user) return undefined;
  const { revoked } = await touchClient(user.id, clientId, assistantName(req.headers.get("user-agent")));
  if (revoked) return undefined;
  return { token: bearer ?? "e2e", clientId, scopes, extra: { userId: user.id, clerkId } };
}
