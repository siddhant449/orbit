import { getChatMessagesHandler } from "@/lib/chat-api";

export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return getChatMessagesHandler(request, ctx);
}
