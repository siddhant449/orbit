import { postedHandler } from "@/lib/documents-api";

type Ctx = { params: Promise<{ id: string }> };

export function POST(request: Request, ctx: Ctx) {
  return postedHandler(request, ctx, true);
}

export function DELETE(request: Request, ctx: Ctx) {
  return postedHandler(request, ctx, false);
}
