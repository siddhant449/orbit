import { AppShell } from "@/components/shell/app-shell";
import { getAccount, getTeamMemberCount, toShellAccount } from "@/lib/account";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  const members = await getTeamMemberCount(account.team.id);
  return <AppShell account={toShellAccount(account, members)}>{children}</AppShell>;
}
