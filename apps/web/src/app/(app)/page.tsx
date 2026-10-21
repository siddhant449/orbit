import { Composer } from "@/components/home/composer";
import { getAccount } from "@/lib/account";

export default async function HomePage() {
  const account = await getAccount();
  const firstName = (account.currentProfile?.name ?? account.user.name ?? "").split(" ")[0] ?? "";
  return <Composer firstName={firstName} />;
}
