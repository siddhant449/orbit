import { deleteDoneHandler, postDoneHandler } from "@/lib/tasks-api";

type Ctx = { params: Promise<{ id: string }> };

export function POST(request: Request, ctx: Ctx) {
  return postDoneHandler(request, ctx);
}

export function DELETE(request: Request, ctx: Ctx) {
  return deleteDoneHandler(request, ctx);
}
