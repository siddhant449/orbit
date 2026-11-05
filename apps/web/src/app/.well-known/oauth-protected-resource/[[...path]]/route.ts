import { metadataOptions, protectedResourceMetadata } from "@/lib/mcp/metadata";

// Public: assistants read this before they have a token. The optional path also answers /.well-known/oauth-protected-resource/api/mcp.
export function GET(request: Request) {
  return protectedResourceMetadata(request);
}
export const OPTIONS = metadataOptions;
