import { AppShell } from "@/components/shell/app-shell";
import { getAccount, toShellAccount } from "@/lib/account";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  return <AppShell account={toShellAccount(account)}>{children}</AppShell>;
}
