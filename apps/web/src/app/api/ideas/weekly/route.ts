import { getWeeklyHandler, postWeeklyHandler } from "@/lib/ideas-weekly-api";

export function GET() {
  return getWeeklyHandler();
}

export function POST() {
  return postWeeklyHandler();
}
