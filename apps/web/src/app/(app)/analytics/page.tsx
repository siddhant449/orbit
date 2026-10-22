import { AnalyticsOffline } from "@/components/analytics/analytics-offline";
import { getAccount } from "@/lib/account";
import { loadActivitySummary } from "@/lib/insights/load-activity";
import { localActivity, RANGES, writingStreak, type LocalActivity, type Range } from "@/lib/insights/local-activity";

export const metadata = { title: "Analytics" };

/*
 * Analytics (screens.md B7, p09 / p22). LinkedIn isn't connected for anyone yet (no OAuth, no statistics sync), so
 * this renders the not-connected state with the profile's real drafting numbers. When the sync lands, a connected
 * profile renders `AnalyticsDashboard` with views built by `buildAnalyticsView` instead.
 */
export default async function AnalyticsPage() {
  const account = await getAccount();
  const profile = account.currentProfile;
  const now = new Date();
  const summary = profile
    ? await loadActivitySummary(profile.id, profile.timezone, now)
    : {
        byRange: Object.fromEntries(
          RANGES.map((r) => [r, localActivity(r, { now, timeZone: "UTC", documents: [], versions: [] })]),
        ) as Record<Range, LocalActivity>,
        streak: writingStreak([], now, "UTC"),
      };
  return (
    <div className="w-full max-w-[1376px] px-5 pb-16 pt-8 md:px-8 md:pb-8 md:pt-[28px]">
      <AnalyticsOffline byRange={summary.byRange} streak={summary.streak} />
    </div>
  );
}
