import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import { authServerMetadataHandlerClerk, metadataCorsOptionsRequestHandler } from "@clerk/mcp-tools/next";
import { getPublicOrigin } from "mcp-handler";

export const MCP_PATH = "/api/mcp";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" };

/** RFC 9728: the MCP endpoint is the protected resource and Clerk (this app's Frontend API) is its authorization server. */
export function protectedResourceMetadata(req: Request, env: Record<string, string | undefined> = process.env): Response {
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return Response.json({ error: "Sign-in isn't configured." }, { status: 500 });
  const metadata = generateClerkProtectedResourceMetadata({ publishableKey, resourceUrl: `${getPublicOrigin(req)}${MCP_PATH}` });
  return Response.json(metadata, { headers: { ...CORS, "Cache-Control": "max-age=3600" } });
}

/** RFC 8414: for clients that look for the authorization server's metadata on the app's own origin, the answer is Clerk's. */
export async function authorizationServerMetadata(): Promise<Response> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return Response.json({ error: "Sign-in isn't configured." }, { status: 500 });
  return authServerMetadataHandlerClerk()();
}

export const metadataOptions = metadataCorsOptionsRequestHandler();
