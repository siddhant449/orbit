import { getDocumentHandler, patchDocumentHandler } from "@/lib/documents-api";

type Ctx = { params: Promise<{ id: string }> };

export function GET(request: Request, ctx: Ctx) {
  return getDocumentHandler(request, ctx);
}

export function PATCH(request: Request, ctx: Ctx) {
  return patchDocumentHandler(request, ctx);
}
