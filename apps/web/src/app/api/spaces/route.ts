import { getSpacesHandler, postSpaceHandler } from "@/lib/saves-api";

export function GET() {
  return getSpacesHandler();
}

export function POST(request: Request) {
  return postSpaceHandler(request);
}
