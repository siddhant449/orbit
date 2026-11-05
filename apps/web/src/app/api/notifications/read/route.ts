import { postNotificationsReadHandler } from "@/lib/notifications-api";

export function POST(request: Request) {
  return postNotificationsReadHandler(request);
}
