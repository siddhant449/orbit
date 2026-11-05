import { getGoalsHandler, putGoalsHandler } from "@/lib/goals-api";

export function GET() {
  return getGoalsHandler();
}

export function PUT(request: Request) {
  return putGoalsHandler(request);
}
