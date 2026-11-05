import { postTallyHandler } from "@/lib/goals-api";

export function POST(request: Request) {
  return postTallyHandler(request);
}
