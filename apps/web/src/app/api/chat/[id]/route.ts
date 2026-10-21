import { deleteChatHandler, patchChatHandler } from "@/lib/chat-api";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: Request, ctx: Ctx) {
  return patchChatHandler(request, ctx);
}

export function DELETE(request: Request, ctx: Ctx) {
  return deleteChatHandler(request, ctx);
}
