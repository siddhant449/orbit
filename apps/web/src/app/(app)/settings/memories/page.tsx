import { listMemory, memoryLines, MEMORY_KEYS } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { EnforcedChecks } from "@/components/memories/enforced-checks";
import { AddMemory } from "@/components/memories/add-memory";
import { ImportDialog } from "@/components/memories/import-dialog";
import { MemoryCard, type MemoryGroupView } from "@/components/memories/memory-card";
import { Reveal } from "@brandloop/ui/scroll";

export const metadata = { title: "Memories" };

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const IDENTITY_TITLES: Record<string, string> = {
  "identity/about": "About you",
  "identity/story": "Your story",
  "identity/personal": "Personal details",
};

const titleCase = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function Page() {
  const account = await getAccount();
  const profile = account.currentProfile;
  const docs = profile ? await listMemory(profile.id) : [];

  const group = (d: (typeof docs)[number], title?: string): MemoryGroupView => ({
    key: d.key,
    title,
    updated: fmt.format(d.updatedAt),
    lines: memoryLines(d.content).map((l) => ({ key: d.key, ...l })),
  });
  const latest = (ds: typeof docs) =>
    ds.length ? fmt.format(new Date(Math.max(...ds.map((d) => d.updatedAt.getTime())))) : undefined;

  const identity = docs.filter((d) => d.key.startsWith("identity/"));
  const rules = docs.filter((d) => d.key === MEMORY_KEYS.rules);
  const voice = docs.filter((d) => d.key === MEMORY_KEYS.voice);
  const topics = docs.filter((d) => d.key.startsWith("topics/"));
  const strategy = docs.filter((d) => d.key.startsWith("strategy/"));
  const hasAny = docs.some((d) => memoryLines(d.content).length > 0);

  return (
    <>
      <PageHeader
        title="Memories"
        subtitle="The facts Orbit uses to make every post sound like you and talk about what you actually know."
        actions={hasAny ? <ImportDialog /> : undefined}
      />
      <PageBody className="flex flex-col gap-3">
        {!profile ? (
          <EmptyState title="No profile yet" body="Add a profile to start building its memories." />
        ) : !hasAny ? (
          <EmptyState
            title="Nothing remembered yet"
            body="Import what another assistant already knows about you, or add the first fact yourself. Every memory stays editable."
            action={
              <>
                <ImportDialog variant="primary" />
                <AddMemory memoryKey={MEMORY_KEYS.personal} variant="secondary" />
              </>
            }
          />
        ) : (
          <>
            <Reveal index={0}>
            <MemoryCard
              title="Identity"
              description="Background and details we use to ground your posts."
              groups={identity.map((d) => group(d, identity.length > 1 ? (IDENTITY_TITLES[d.key] ?? titleCase(d.key.split("/")[1]!)) : undefined))}
              updated={latest(identity)}
              addKey={MEMORY_KEYS.personal}
            />
            </Reveal>
            <Reveal index={1}>
            <MemoryCard
              title="Writing preferences"
              description="Your rules for how your posts are written."
              groups={rules.map((d) => group(d))}
              updated={latest(rules)}
              addKey={MEMORY_KEYS.rules}
            />
            <div className="mt-3">
              <EnforcedChecks markdown={rules.map((d) => d.content).join("\n")} />
            </div>
            </Reveal>
            <Reveal index={2}>
            <MemoryCard
              title="Voice"
              description="How your writing sounds, in your own patterns."
              groups={voice.map((d) => group(d))}
              updated={latest(voice)}
              addKey={MEMORY_KEYS.voice}
            />
            </Reveal>
            <Reveal index={3}>
            <MemoryCard
              title="Topics you know"
              description="What you can speak about with authority, one topic at a time."
              groups={topics.map((d) => group(d, titleCase(d.key.split("/")[1]!)))}
              updated={latest(topics)}
              addTopic
            />
            </Reveal>
            {strategy.length > 0 && (
              <Reveal index={4}>
                <MemoryCard
                  title="Strategy notes"
                  description="Decisions about audience and goals that shape what we suggest."
                  groups={strategy.map((d) => group(d, titleCase(d.key.split("/")[1]!)))}
                  updated={latest(strategy)}
                />
              </Reveal>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
