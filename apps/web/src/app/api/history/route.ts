import { getHistoryHandler } from "@/lib/chat-api";

export function GET(request: Request) {
  return getHistoryHandler(request);
}
