import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { throttled, verifyMcpRequest, type McpAuthDeps } from "./auth";
import { configuredOrigin } from "./metadata";
import { registerMcpTools, type McpToolDeps } from "./tools";

export type McpEndpointDeps = { auth?: McpAuthDeps; tools?: McpToolDeps };

/** The MCP endpoint: Streamable HTTP, every request authenticated by `verifyMcpRequest` (401 with the resource-metadata challenge otherwise, 429 when a user is over the request limit). */
export function createMcpEndpoint(deps: McpEndpointDeps = {}): (req: Request) => Promise<Response> {
  const mcp = createMcpHandler((server) => registerMcpTools(server, deps.tools), { serverInfo: { name: "orbit", version: "1.0.0" } });
  const guarded = withMcpAuth(mcp, (req, bearer) => verifyMcpRequest(req, bearer, deps.auth), {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
    resourceUrl: configuredOrigin(deps.auth?.env),
  });
  return async (req) => {
    const res = await guarded(req);
    const retry = throttled.get(req);
    if (retry === undefined) return res;
    return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "retry-after": String(retry) } });
  };
}
