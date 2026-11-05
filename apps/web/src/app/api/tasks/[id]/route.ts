import { deleteTaskHandler, patchTaskHandler } from "@/lib/tasks-api";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: Request, ctx: Ctx) {
  return patchTaskHandler(request, ctx);
}

export function DELETE(request: Request, ctx: Ctx) {
  return deleteTaskHandler(request, ctx);
}
