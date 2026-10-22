import { EmptyState, PageBody, PageHeader } from "@/components/page";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Manage account" };

export default async function AccountSettingsPage() {
  const account = await getAccount();
  const profile = account.currentProfile;
  return (
    <>
      <PageHeader className="max-w-[760px]" title="Manage account" />
      <PageBody className="max-w-[760px]">
        {profile ? (
          <AccountSettingsForm
            email={account.user.email}
            profile={{ id: profile.id, name: profile.name, language: profile.language, timezone: profile.timezone }}
          />
        ) : (
          <EmptyState title="No profile yet" body="Add a profile to change its settings." />
        )}
      </PageBody>
    </>
  );
}
