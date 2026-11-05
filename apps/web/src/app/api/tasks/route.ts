import { getTasksHandler, postTaskHandler } from "@/lib/tasks-api";

export function GET(request: Request) {
  return getTasksHandler(request);
}

export function POST(request: Request) {
  return postTaskHandler(request);
}
