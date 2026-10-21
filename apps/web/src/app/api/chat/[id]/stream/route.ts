import { getChatStreamHandler } from "@/lib/chat-api";

// Tailing a live run lasts as long as the run itself.
export const maxDuration = 300;

export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return getChatStreamHandler(request, ctx);
}
