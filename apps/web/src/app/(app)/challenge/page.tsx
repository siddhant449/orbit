import { getActiveChallenge } from "@brandloop/db";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { SprintView } from "@/components/sprint/sprint-view";
import { getAccount } from "@/lib/account";
import { toChallengeView } from "@/lib/challenge-api";
import { dayKeyIn } from "@/lib/progress/days";

export const metadata = { title: "30-day challenge" };

/**
 * 30-day challenge (screens.md B9, p11/p24): the stored enrollment, or the Start screen when there is none. The newest
 * challenge shows even after it ended, as a summary with Start again.
 */
export default async function Page() {
  const profile = (await getAccount()).currentProfile;
  if (!profile) {
    return (
      <>
        <PageHeader title="30-day challenge" />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to run a challenge for it." />
        </PageBody>
      </>
    );
  }
  const now = new Date();
  const challenge = await getActiveChallenge(profile.id, now, { includeEnded: true });
  return <SprintView challenge={challenge ? toChallengeView(challenge) : null} today={dayKeyIn(now, profile.timezone || "UTC")} />;
}
