export type HistoryGroupLabel = "Pinned" | "Today" | "Yesterday" | "Previous 7 days" | "Previous 30 days" | "Older";

const ORDER: HistoryGroupLabel[] = ["Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];
const DAY = 86_400_000;

/** Local midnight of the day `d` falls on. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Buckets chats for the sidebar by the viewer's local calendar days. Pinned chats come first whatever their
 * date; order inside a bucket follows the input (the API sends newest first). Empty buckets are dropped.
 */
export function groupChatsByDate<T extends { lastActivityAt: string | Date; pinned: boolean }>(
  chats: T[],
  now: Date,
): { label: HistoryGroupLabel; chats: T[] }[] {
  const today = startOfDay(now);
  const buckets = new Map<HistoryGroupLabel, T[]>();
  for (const chat of chats) {
    let label: HistoryGroupLabel;
    if (chat.pinned) label = "Pinned";
    else {
      // Whole local days between the chat's day and today; DST shifts are absorbed by rounding.
      const days = Math.round((today - startOfDay(new Date(chat.lastActivityAt))) / DAY);
      label = days <= 0 ? "Today" : days === 1 ? "Yesterday" : days <= 7 ? "Previous 7 days" : days <= 30 ? "Previous 30 days" : "Older";
    }
    const list = buckets.get(label) ?? [];
    list.push(chat);
    buckets.set(label, list);
  }
  return ORDER.filter((l) => buckets.has(l)).map((label) => ({ label, chats: buckets.get(label)! }));
}
