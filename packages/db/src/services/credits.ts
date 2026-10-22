import { prisma } from "../client";
import type { Prisma } from "../generated/prisma/client";

export const CREDIT_PERIOD_MS = 30 * 86_400_000;
export const DEFAULT_MONTHLY_ALLOCATION = 30;

export type Tx = Prisma.TransactionClient;

export type CreditsState = { balance: number; monthlyAllocation: number; periodStartedAt: Date; refillsAt: Date };

export class OutOfCreditsError extends Error {
  constructor(
    readonly balance: number,
    readonly refillsAt: Date,
  ) {
    super("Out of image credits");
    this.name = "OutOfCreditsError";
  }
}

type Account = { teamId: string; balance: number; monthlyAllocation: number; periodStartedAt: Date };

export const toState = (a: Account): CreditsState => ({
  balance: a.balance,
  monthlyAllocation: a.monthlyAllocation,
  periodStartedAt: a.periodStartedAt,
  refillsAt: new Date(a.periodStartedAt.getTime() + CREDIT_PERIOD_MS),
});

/**
 * Creates the team's account if missing, then row-locks it (`FOR UPDATE`) BEFORE any balance read, and applies the lazy
 * refill. Everything that moves credits goes through this inside one transaction.
 */
export async function lockAccount(tx: Tx, teamId: string, now: Date): Promise<Account> {
  await tx.creditAccount.createMany({ data: [{ teamId, periodStartedAt: now }], skipDuplicates: true });
  const rows = await tx.$queryRaw<Account[]>`
    SELECT "teamId", balance, "monthlyAllocation", "periodStartedAt" FROM "CreditAccount" WHERE "teamId" = ${teamId} FOR UPDATE`;
  return refillIfDue(tx, rows[0]!, now);
}

/**
 * Once `now` is at least one 30-day period past `periodStartedAt`, the balance resets to the allocation (no rollover)
 * and the period start advances by whole periods. A MONTHLY_RESET ledger row records the change.
 */
export async function refillIfDue(tx: Tx, account: Account, now: Date): Promise<Account> {
  const periods = Math.floor((now.getTime() - account.periodStartedAt.getTime()) / CREDIT_PERIOD_MS);
  if (periods < 1) return account;
  const periodStartedAt = new Date(account.periodStartedAt.getTime() + periods * CREDIT_PERIOD_MS);
  const delta = account.monthlyAllocation - account.balance;
  await tx.creditAccount.update({ where: { teamId: account.teamId }, data: { balance: account.monthlyAllocation, periodStartedAt } });
  if (delta !== 0) {
    await tx.creditLedger.create({
      data: { teamId: account.teamId, delta, balanceAfter: account.monthlyAllocation, reason: "MONTHLY_RESET", createdAt: now },
    });
  }
  return { ...account, balance: account.monthlyAllocation, periodStartedAt };
}

/** The team's credits, creating the account on first read and applying any due refill. */
export function getCredits(teamId: string, now: Date = new Date()): Promise<CreditsState> {
  return prisma.$transaction(async (tx) => toState(await lockAccount(tx, teamId, now)));
}
