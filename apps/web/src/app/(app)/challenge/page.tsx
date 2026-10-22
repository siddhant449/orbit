import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { SprintView } from "@/components/sprint/sprint-view";
import { getAccount } from "@/lib/account";
import { loadProgress } from "@/lib/progress/load";
import { buildSprint, parseStart } from "@/lib/sprint/plan";

export const metadata = { title: "30-day sprint" };

/**
 * 30-day sprint (screens.md B9, p11/p24). No sprint is stored yet: the calendar runs from `?start=` when the page
 * carries one, otherwise it previews a sprint starting today. Day ticks come from the drafts started each day.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = (await getAccount()).currentProfile;
  if (!profile) {
    return (
      <>
        <PageHeader title="30-day sprint" />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to run a sprint for it." />
        </PageBody>
      </>
    );
  }
  const progress = await loadProgress(profile);
  const pinned = parseStart((await searchParams).start, progress.today);
  const sprint = buildSprint({ start: pinned ?? progress.today, today: progress.today, drafts: progress.drafts });
  return <SprintView sprint={sprint} pinned={pinned !== null} />;
}
