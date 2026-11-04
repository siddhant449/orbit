import { deleteSaveHandler, patchSaveHandler } from "@/lib/saves-api";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: Request, ctx: Ctx) {
  return patchSaveHandler(request, ctx);
}

export function DELETE(request: Request, ctx: Ctx) {
  return deleteSaveHandler(request, ctx);
}
