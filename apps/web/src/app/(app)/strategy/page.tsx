import { getStrategy, listMemory, memoryLines } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { AudienceBalance } from "@/components/strategy/audience-balance";
import { ContentMix } from "@/components/strategy/content-mix";
import { StrategyProvider } from "@/components/strategy/edit";
import { Foundation } from "@/components/strategy/foundation";
import { FormatsCadence } from "@/components/strategy/formats-cadence";
import { GenerateButton } from "@/components/strategy/generate-button";
import { Series } from "@/components/strategy/series";
import { toInput } from "@/components/strategy/types";

export const metadata = { title: "Strategy" };

export default async function Page() {
  const profile = (await getAccount()).currentProfile;
  const strategy = profile ? await getStrategy(profile.id) : null;
  const docs = profile && !strategy ? await listMemory(profile.id) : [];
  const hasIdentity = docs.some((d) => d.key.startsWith("identity/") && memoryLines(d.content).length > 0);

  const subtitle = "Your goal, positioning and what to post each week, built from your memories and knowledge.";

  if (!profile) {
    return (
      <>
        <PageHeader title="Strategy" subtitle={subtitle} />
        <PageBody>
          <EmptyState title="No profile yet" body="Add a profile to build its content strategy." />
        </PageBody>
      </>
    );
  }

  if (!strategy) {
    return (
      <>
        <PageHeader title="Strategy" subtitle={subtitle} />
        <PageBody>
          <EmptyState
            title="No strategy yet"
            body={
              <>
                <p>Your strategy sets your goal, positioning and what to post each week. It comes from your memories and knowledge base.</p>
                {!hasIdentity && <p className="mt-2">Add your identity in Memories first for a sharper strategy.</p>}
              </>
            }
            action={<GenerateButton />}
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        className="max-w-[960px]"
        title="Strategy"
        subtitle={subtitle}
        actions={<GenerateButton label="Regenerate strategy" variant="secondary" confirmReplace />}
      />
      <PageBody className="flex max-w-[960px] flex-col gap-3">
        <StrategyProvider strategy={toInput(strategy)}>
          <Foundation />
          <ContentMix />
          <AudienceBalance />
          <FormatsCadence />
          <Series />
        </StrategyProvider>
        <p className="px-1 pt-2 text-[12px] text-text-2">Select any text to edit it. Regenerating replaces the current strategy, including your edits.</p>
      </PageBody>
    </>
  );
}
