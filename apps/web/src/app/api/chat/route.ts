import { postChatHandler } from "@/lib/chat-api";

// A turn can run up to 12 model steps with tools.
export const maxDuration = 300;

export function POST(request: Request) {
  return postChatHandler(request);
}
