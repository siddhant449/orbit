import { getActiveChallenge, getTallies, getWeeklyGoal, listBadges, listTaskDones, listTasks } from "@brandloop/db";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { ActivitiesView } from "@/components/activities/activities-view";
import { getAccount } from "@/lib/account";
import { weekStartOn } from "@/lib/ideas/week";
import { gettingStarted } from "@/lib/progress/activity";
import { awardBadgesQuietly } from "@/lib/progress/award";
import { addDays, resetsIn } from "@/lib/progress/days";
import { goalWeeks, weekStreak } from "@/lib/progress/goals";
import { loadProgress } from "@/lib/progress/load";
import { summarizeChallenge } from "@/lib/sprint/status";
import { toChallengeView } from "@/lib/challenge-api";
import { TASK_HISTORY_DAYS } from "@/lib/tasks-api";

export const metadata = { title: "Activities" };

/**
 * Activities (screens.md B8): the weekly goals (posts counted from "Mark as posted", the rest by hand), the week streak,
 * badges, the day strip and today's to-dos are all stored; getting started stays derived from onboarding data.
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
  const week = weekStartOn(now, p.timeZone);
  // Badges first, so a streak or a first-time event that happened without a click is held before the list is read.
  await awardBadgesQuietly(profile.id);
  const [goal, tally, tasks, dones, badges, challenge] = await Promise.all([
    getWeeklyGoal(profile.id),
    getTallies(profile.id, week),
    listTasks(profile.id),
    listTaskDones(profile.id, addDays(p.today, -TASK_HISTORY_DAYS)),
    listBadges(profile.id, now),
    getActiveChallenge(profile.id, now),
  ]);
  const weeks = goalWeeks(p.posted, p.today, goal.posts);
  const running = challenge ? summarizeChallenge(toChallengeView(challenge)) : null;
  return (
    <ActivitiesView
      today={p.today}
      weekPosted={weeks[weeks.length - 1]!.posted}
      streak={weekStreak(weeks)}
      goal={goal}
      tally={tally}
      tasks={tasks}
      dones={dones}
      badges={badges.map(({ awardedAt: _awardedAt, ...b }) => b)}
      checklist={gettingStarted({ strategy: p.strategy, identity: p.identity, knowledge: p.knowledge, voice: p.voice, drafts: p.draftTotal })}
      resets={resetsIn(now, p.timeZone)}
      postedToday={(p.posted[p.today] ?? 0) > 0}
      postHref={running && running.phase === "active" ? "/challenge" : "/"}
    />
  );
}
