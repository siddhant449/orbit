import { linkChatHandler } from "@/lib/documents-api";

export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return linkChatHandler(request, ctx);
}
