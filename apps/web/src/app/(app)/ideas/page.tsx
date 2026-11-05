import { listIdeaWeeks } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { ForYou } from "@/components/ideas/for-you";
import { weekStartOn } from "@/lib/ideas/week";
import type { WeekDto } from "@/lib/ideas/for-you";

export const metadata = { title: "For you" };

/** For you (screens.md B11): the profile's stored weekly ideas. A missing batch can be made here; the daily job makes it otherwise. */
export default async function Page() {
  const profile = (await getAccount()).currentProfile;
  if (!profile) {
    return (
      <>
        <PageHeader title="For you" />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to get post ideas for the week." />
        </PageBody>
      </>
    );
  }
  const weeks = await listIdeaWeeks(profile.id, { weeks: 8 });
  return (
    <ForYou
      // Dates cross to the client as strings.
      initialWeeks={JSON.parse(JSON.stringify(weeks)) as WeekDto[]}
      currentWeek={weekStartOn(new Date(), profile.timezone ?? "UTC")}
      generationDay={profile.generationDayOfWeek}
    />
  );
}
