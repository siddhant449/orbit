import { PageBody, PageHeader } from "@/components/page";
import { ProfileList } from "@/components/settings/profile-list";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Manage team" };

export default async function TeamPage() {
  const account = await getAccount();
  return (
    <>
      <PageHeader title="Manage team" />
      <PageBody>
        <section aria-labelledby="team-heading">
          <h2 id="team-heading" className="font-display text-base font-semibold">
            {account.team.name}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            You’re the {account.role.toLowerCase()} of this team. Inviting teammates comes with billing.
          </p>
        </section>
        <section aria-labelledby="profiles-heading" className="mt-10">
          <h2 id="profiles-heading" className="font-display text-base font-semibold">
            Profiles
          </h2>
          <p className="mt-1 text-sm text-ink-muted">Each profile writes in its own voice and posts to its own LinkedIn account.</p>
          <ProfileList
            currentProfileId={account.currentProfile?.id ?? null}
            profiles={account.profiles.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }))}
          />
        </section>
      </PageBody>
    </>
  );
}
