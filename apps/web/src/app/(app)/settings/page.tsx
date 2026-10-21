import { PageBody, PageHeader } from "@/components/page";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { getAccount } from "@/lib/account";

export const metadata = { title: "Manage account" };

export default async function AccountSettingsPage() {
  const account = await getAccount();
  const profile = account.currentProfile;
  return (
    <>
      <PageHeader title="Manage account" />
      <PageBody>
        {profile ? (
          <AccountSettingsForm
            email={account.user.email}
            profile={{ id: profile.id, name: profile.name, language: profile.language, timezone: profile.timezone }}
          />
        ) : (
          <p className="text-sm text-ink-muted">Add a profile to change its settings.</p>
        )}
      </PageBody>
    </>
  );
}
