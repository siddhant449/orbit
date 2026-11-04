import { fromPostHandler } from "@/lib/templates-api";

/** Suggests a template from one of the user's posts (one model call). Nothing is saved until the user confirms. */
export function POST(request: Request) {
  return fromPostHandler(request);
}
