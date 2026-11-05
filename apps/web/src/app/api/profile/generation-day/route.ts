import { patchGenerationDayHandler } from "@/lib/ideas-weekly-api";

export function PATCH(request: Request) {
  return patchGenerationDayHandler(request);
}
