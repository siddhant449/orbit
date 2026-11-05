import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpRequest, type McpAuthDeps } from "./auth";
import { registerMcpTools, type McpToolDeps } from "./tools";

export type McpEndpointDeps = { auth?: McpAuthDeps; tools?: McpToolDeps };

/** The MCP endpoint: Streamable HTTP, every request authenticated by `verifyMcpRequest` (401 with the resource-metadata challenge otherwise). */
export function createMcpEndpoint(deps: McpEndpointDeps = {}): (req: Request) => Promise<Response> {
  const mcp = createMcpHandler((server) => registerMcpTools(server, deps.tools), { serverInfo: { name: "orbit", version: "1.0.0" } });
  return withMcpAuth(mcp, (req, bearer) => verifyMcpRequest(req, bearer, deps.auth), { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp" });
}
