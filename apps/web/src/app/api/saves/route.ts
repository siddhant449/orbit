import { getSavesHandler, postSaveHandler } from "@/lib/saves-api";

export function GET(request: Request) {
  return getSavesHandler(request);
}

export function POST(request: Request) {
  return postSaveHandler(request);
}
