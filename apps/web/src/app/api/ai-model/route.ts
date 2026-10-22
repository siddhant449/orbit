import { getAiModelHandler, putAiModelHandler } from "@/lib/chat-api";

export function GET() {
  return getAiModelHandler();
}

export function PUT(request: Request) {
  return putAiModelHandler(request);
}
