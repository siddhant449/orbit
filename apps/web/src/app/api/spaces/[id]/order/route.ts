import { putSpaceOrderHandler } from "@/lib/saves-api";

export function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return putSpaceOrderHandler(request, ctx);
}
