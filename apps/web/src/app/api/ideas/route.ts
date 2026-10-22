import { postIdeasHandler } from "@/lib/ideas-api";

// One structured-output call over the strategy, memory and recent posts.
export const maxDuration = 120;

export function POST(request: Request) {
  return postIdeasHandler(request);
}
