import { KNOWLEDGE_PAGE_SIZE, listKnowledge } from "@brandloop/db";
import { StatusPill } from "@brandloop/ui";
import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { AddKnowledge, RefreshWhileIndexing } from "@/components/knowledge/add-knowledge";
import { DeleteKnowledge } from "@/components/knowledge/delete-knowledge";
import { knowledgeStatus, knowledgeTypeLabel } from "@/components/knowledge/knowledge-view";

export const metadata = { title: "Knowledge" };

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Knowledge (screens.md B14): board-card rows with an indexing pill each, and a dashed "Add" card. Real items only. */
export default async function Page() {
  const profile = (await getAccount()).currentProfile;
  const subtitle = "The material Orbit draws on when it writes for you: notes, documents and web pages. Private to this profile.";

  if (!profile) {
    return (
      <>
        <PageHeader title="Knowledge" subtitle={subtitle} />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to start its knowledge." />
        </PageBody>
      </>
    );
  }

  const { items, hasMore } = await listKnowledge(profile.id, { order: "desc", offset: 0 });

  return (
    <>
      <PageHeader className="max-w-[1120px]" title="Knowledge" subtitle={subtitle} />
      <PageBody className="max-w-[1120px]">
        <RefreshWhileIndexing active={items.some((i) => i.status === "PROCESSING")} />
        {items.length === 0 && (
          <p className="mb-4 max-w-[60ch] text-[14px] leading-[1.6] text-text-2">
            Nothing here yet. Add a web page or a note and Orbit will use it in your drafts.
          </p>
        )}
        <ul
          aria-label="Knowledge items"
          className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-3"
        >
          <li className="flex">
            <AddKnowledge />
          </li>
          {items.map((item) => {
            const status = knowledgeStatus(item.status);
            return (
              <li key={item.id} className="orbit-panel flex min-h-[148px] flex-col gap-2.5 rounded-card-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="line-clamp-2 min-w-0 text-[14px] font-medium leading-snug text-text">{item.title}</h2>
                  {status.tone === "accent" ? (
                    <StatusPill tone="accent" className="min-h-6 px-2.5 text-[11px]">
                      {status.label}
                    </StatusPill>
                  ) : (
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  )}
                </div>
                <p className="line-clamp-3 flex-1 text-[13px] leading-[1.55] text-text-2">
                  {item.status === "FAILED" ? (item.error ?? "Orbit couldn't read this one.") : (item.summary ?? item.sourceUrl ?? "")}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-text-2">
                    {knowledgeTypeLabel(item.type)} · Added {fmt.format(item.createdAt)}
                  </p>
                  {/* No retry route exists for failed ingests yet, so a failed item can only be deleted and re-added. */}
                  <DeleteKnowledge id={item.id} title={item.title} />
                </div>
              </li>
            );
          })}
        </ul>
        {/* Paging and search over older items arrive with AI Task 17. */}
        {hasMore && (
          <p className="mt-4 text-[13px] text-text-2">
            Showing the {KNOWLEDGE_PAGE_SIZE} most recent items. Browsing older ones arrives in a later release.
          </p>
        )}
      </PageBody>
    </>
  );
}
