import { stopChatHandler } from "@/lib/chat-api";

export function POST(request: Request) {
  return stopChatHandler(request);
}
