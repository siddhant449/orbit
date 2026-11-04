import { listSpaces } from "@brandloop/db";
import { PageBody, PageHeader } from "@/components/page";
import { SavesView } from "@/components/saves/saves-view";
import { getAccount } from "@/lib/account";

export const metadata = { title: "All saves" };

/** `?space=<id>` shows one space; an unknown or other profile's id falls back to a friendly message in the view. */
export default async function Page({ searchParams }: { searchParams: Promise<{ space?: string | string[] }> }) {
  const raw = (await searchParams).space;
  const spaceId = typeof raw === "string" && raw ? raw : undefined;
  const profileId = (await getAccount())?.currentProfile?.id;
  const space = spaceId && profileId ? (await listSpaces(profileId)).find((s) => s.id === spaceId) : undefined;
  return (
    <>
      <PageHeader
        title={space?.name ?? "All saves"}
        subtitle={space ? undefined : "Everything you've saved: templates, hooks, ideas, posts and images. Group them into spaces from the sidebar."}
      />
      <PageBody>
        <SavesView spaceId={spaceId} />
      </PageBody>
    </>
  );
}
