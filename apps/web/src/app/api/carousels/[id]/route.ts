import { deleteHandler, getHandler, patchHandler } from "@/lib/carousels-api";

type Ctx = { params: Promise<{ id: string }> };

export const GET = (request: Request, ctx: Ctx) => getHandler(request, ctx);
export const PATCH = (request: Request, ctx: Ctx) => patchHandler(request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => deleteHandler(request, ctx);
