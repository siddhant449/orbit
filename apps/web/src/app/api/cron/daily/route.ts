import { getCronHandler } from "@/lib/ideas/cron";

export const maxDuration = 300;

export function GET(request: Request) {
  return getCronHandler(request);
}
