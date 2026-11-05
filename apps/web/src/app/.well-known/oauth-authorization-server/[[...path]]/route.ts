import { authorizationServerMetadata, metadataOptions } from "@/lib/mcp/metadata";

// Public: the same answer Clerk gives at its own Frontend API.
export function GET() {
  return authorizationServerMetadata();
}
export const OPTIONS = metadataOptions;
