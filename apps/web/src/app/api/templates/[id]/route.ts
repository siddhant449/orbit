import { deleteTemplateHandler, patchTemplateHandler } from "@/lib/templates-api";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: Request, ctx: Ctx) {
  return patchTemplateHandler(request, ctx);
}

export function DELETE(request: Request, ctx: Ctx) {
  return deleteTemplateHandler(request, ctx);
}
