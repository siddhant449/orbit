import { deleteSpaceHandler, patchSpaceHandler } from "@/lib/saves-api";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: Request, ctx: Ctx) {
  return patchSpaceHandler(request, ctx);
}

export function DELETE(request: Request, ctx: Ctx) {
  return deleteSpaceHandler(request, ctx);
}
