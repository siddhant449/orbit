import { deleteMcpClientHandler, reconnectMcpClientHandler } from "@/lib/mcp-settings-api";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return deleteMcpClientHandler((await ctx.params).id);
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return reconnectMcpClientHandler((await ctx.params).id);
}
