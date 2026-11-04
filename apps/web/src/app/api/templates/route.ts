import { getTemplatesHandler, postTemplateHandler } from "@/lib/templates-api";

/** The template library for the Templates page and the composer's Format menu. */
export function GET(request: Request) {
  return getTemplatesHandler(request);
}

export function POST(request: Request) {
  return postTemplateHandler(request);
}
