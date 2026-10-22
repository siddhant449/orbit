import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { IdeasBoard } from "@/components/ideas/ideas-board";
import { loadIdeasContext } from "@/lib/ideas-api";

export const metadata = { title: "For you" };

/** For you (screens.md B11): this week's ideas, generated on demand from the profile's strategy, memory and posts. */
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
  const { ctx, basis } = await loadIdeasContext(profile.id, profile.timezone ?? "UTC", new Date());
  return <IdeasBoard profileId={profile.id} weekOf={ctx.weekOf} basis={basis} />;
}
