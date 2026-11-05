import { getNotificationsHandler } from "@/lib/notifications-api";

export function GET() {
  return getNotificationsHandler();
}
