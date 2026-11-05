import { putOrderHandler } from "@/lib/tasks-api";

export function PUT(request: Request) {
  return putOrderHandler(request);
}
