import { getMcpSettingsHandler, putMcpSettingsHandler } from "@/lib/mcp-settings-api";

export function GET() {
  return getMcpSettingsHandler();
}
export function PUT(request: Request) {
  return putMcpSettingsHandler(request);
}
