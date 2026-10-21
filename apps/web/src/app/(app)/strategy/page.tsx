import { getStrategy, listMemory, memoryLines } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { PageBody, PageHeader } from "@/components/page";
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

  if (!profile) {
    return (
      <>
        <PageHeader title="Strategy" />
        <PageBody>
          <p className="text-sm text-ink-muted">Add a profile to build its content strategy.</p>
        </PageBody>
      </>
    );
  }

  if (!strategy) {
    return (
      <>
        <PageHeader title="Strategy" />
        <PageBody>
          <div className="max-w-xl py-6">
            <h2 className="font-display text-xl font-semibold leading-snug tracking-[-0.01em]">No strategy yet</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              Your strategy sets your goal, positioning and what to post each week. It comes from your memories and knowledge base.
            </p>
            <div className="mt-5">
              <GenerateButton />
            </div>
            {!hasIdentity && (
              <p className="mt-3 text-sm text-ink-muted">Add your identity in Memories first for a sharper strategy.</p>
            )}
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Strategy" actions={<GenerateButton label="Regenerate strategy" variant="secondary" />} />
      <PageBody className="max-w-4xl space-y-4">
        <StrategyProvider strategy={toInput(strategy)}>
          <Foundation />
          <ContentMix />
          <AudienceBalance />
          <FormatsCadence />
          <Series />
        </StrategyProvider>
        <p className="text-xs text-ink-muted">Select any text to edit it. Regenerating replaces the current strategy.</p>
      </PageBody>
    </>
  );
}
