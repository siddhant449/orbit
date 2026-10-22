import { PageBody, PageHeader } from "@/components/page";
import { ProfileList } from "@/components/settings/profile-list";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Manage team" };

export default async function TeamPage() {
  const account = await getAccount();
  return (
    <>
      <PageHeader className="max-w-[760px]" title="Manage team" subtitle="Your team and the profiles it writes for." />
      <PageBody className="max-w-[760px]">
        <section aria-labelledby="team-heading" className="orbit-panel p-5 sm:p-6">
          <h2 id="team-heading" className="type-card-title text-text">
            {account.team.name}
          </h2>
          <p className="mt-2 text-[14px] leading-[1.55] text-text-2">
            You’re the {account.role.toLowerCase()} of this team. Inviting teammates comes with billing.
          </p>
        </section>
        <section aria-labelledby="profiles-heading" className="mt-9">
          <h2 id="profiles-heading" className="text-[14px] font-medium text-text-2">
            Profiles
          </h2>
          <p className="mt-1 text-[13px] text-text-2">Each profile writes in its own voice and posts to its own LinkedIn account.</p>
          <ProfileList
            currentProfileId={account.currentProfile?.id ?? null}
            profiles={account.profiles.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }))}
          />
        </section>
      </PageBody>
    </>
  );
}
