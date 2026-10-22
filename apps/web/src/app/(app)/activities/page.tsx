import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { ActivitiesView } from "@/components/activities/activities-view";
import { getAccount } from "@/lib/account";
import {
  bestWeekdayStreak,
  draftsThisWeek,
  gettingStarted,
  hadFullWeek,
  milestones,
  weekdayStreak,
} from "@/lib/progress/activity";
import { resetsIn } from "@/lib/progress/days";
import { loadProgress } from "@/lib/progress/load";
import { buildSprint } from "@/lib/sprint/plan";

export const metadata = { title: "Activities" };

/**
 * Activities (screens.md B8, p10/p23). Streak, the drafts goal, milestones, the day strip and getting started are
 * derived from existing data (drafts = documents started in chat; onboarding = strategy, memories, knowledge, voice).
 * LinkedIn goals and routines show what they will track, without numbers, until LinkedIn is connected.
 */
export default async function Page() {
  const profile = (await getAccount()).currentProfile;
  if (!profile) {
    return (
      <>
        <PageHeader title="Activities" />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to track its weekly goals." />
        </PageBody>
      </>
    );
  }
  const now = new Date();
  const p = await loadProgress(profile, now);
  const best = bestWeekdayStreak(p.drafts, p.today);
  // No sprint is stored yet, so "today's post" is the format a sprint starting today would open with.
  const focus = buildSprint({ start: p.today, today: p.today, drafts: p.drafts }).focus;
  return (
    <ActivitiesView
      today={p.today}
      drafts={p.drafts}
      streak={weekdayStreak(p.drafts, p.today)}
      weekDrafts={draftsThisWeek(p.drafts, p.today)}
      milestones={milestones({ total: p.draftTotal, best, fullWeek: hadFullWeek(p.drafts) })}
      checklist={gettingStarted({ strategy: p.strategy, identity: p.identity, knowledge: p.knowledge, voice: p.voice, drafts: p.draftTotal })}
      resets={resetsIn(now, p.timeZone)}
      todayPost={focus?.format ? { day: focus.day, format: focus.format } : null}
    />
  );
}
