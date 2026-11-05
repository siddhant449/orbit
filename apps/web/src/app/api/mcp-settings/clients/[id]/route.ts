import { deleteMcpClientHandler } from "@/lib/mcp-settings-api";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return deleteMcpClientHandler((await ctx.params).id);
}
