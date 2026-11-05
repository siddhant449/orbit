import { createMcpEndpoint } from "@/lib/mcp/handler";

// Authenticated by the bearer token (a Clerk OAuth access token) inside the handler, not by the session middleware.
export const maxDuration = 60;

const handler = createMcpEndpoint();
export { handler as GET, handler as POST, handler as DELETE };
