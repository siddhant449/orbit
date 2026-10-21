"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShellAccount } from "@/lib/account";

const AccountContext = createContext<ShellAccount | null>(null);

export function AccountProvider({ account, children }: { account: ShellAccount; children: ReactNode }) {
  return <AccountContext value={account}>{children}</AccountContext>;
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount must be used inside AccountProvider");
  return account;
}

export function useCurrentProfile() {
  const account = useAccount();
  return account.profiles.find((p) => p.id === account.currentProfileId) ?? account.profiles[0] ?? null;
}
