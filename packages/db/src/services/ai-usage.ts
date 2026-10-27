import { AiBlockedError, setUsageGate, setUsageRecorder, type UsageEvent, type UsageWho } from "@brandloop/ai";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../client";

/*
 * The AI usage ledger (table `AiUsage`) and the per-user controls (`User.dailyCapMicroUsd`, `User.aiBlocked`).
 *
 * Writes are fire-and-forget: `recordAiUsage` only pushes to an in-memory buffer; a short timer writes the buffer with
 * one createMany (and fills a missing user/team from the profile in one lookup). A failed write is logged without
 * any row content and dropped, so the ledger can never slow or fail a request. Rows never hold prompt or output text.
 *
 * Controls live on the user, not the profile: an admin manages people, and a person with several profiles has one
 * budget. The running cost counter (packages/ai usage-limits) is still per profile, so a user's cap applies to each of
 * their profiles' daily counter; the ledger-based "spent today" shown to admins sums across all of them.
 */

const FLUSH_MS = 250;
const MAX_BUFFER = 500;
const g = globalThis as unknown as { __aiUsageBuffer?: { rows: UsageEvent[]; timer: ReturnType<typeof setTimeout> | null } };
const buf = () => (g.__aiUsageBuffer ??= { rows: [], timer: null });

/** Queues one ledger row. Never throws, never waits. */
export function recordAiUsage(event: UsageEvent): void {
  const b = buf();
  if (b.rows.length >= MAX_BUFFER) b.rows.shift();
  b.rows.push(event);
  if (!b.timer) {
    b.timer = setTimeout(() => void flushAiUsage(), FLUSH_MS);
    b.timer.unref?.();
  }
}

/** Writes the buffered rows now (tests, shutdown). Errors are logged without row content. */
export async function flushAiUsage(): Promise<void> {
  const b = buf();
  if (b.timer) clearTimeout(b.timer);
  b.timer = null;
  const rows = b.rows.splice(0);
  if (rows.length === 0) return;
  try {
    const missing = [...new Set(rows.filter((r) => r.profileId && (!r.userId || !r.teamId)).map((r) => r.profileId!))];
    const owners = missing.length
      ? new Map((await prisma.profile.findMany({ where: { id: { in: missing } }, select: { id: true, teamId: true, ownerUserId: true } })).map((p) => [p.id, p]))
      : new Map<string, { teamId: string; ownerUserId: string }>();
    await prisma.aiUsage.createMany({
      data: rows.map((r) => {
        const p = r.profileId ? owners.get(r.profileId) : undefined;
        return {
          userId: r.userId ?? p?.ownerUserId ?? null,
          teamId: r.teamId ?? p?.teamId ?? null,
          profileId: r.profileId ?? null,
          chatId: r.chatId ?? null,
          feature: r.feature,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          costMicroUsd: r.costMicroUsd,
          ok: r.ok,
        };
      }),
    });
  } catch (err) {
    console.error(`[ai-usage] ledger write failed (${rows.length} rows dropped): ${err instanceof Error ? err.name : "error"}`);
  }
}

// ---- controls ---------------------------------------------------------------------------------------------------

export type AiControls = { aiBlocked: boolean; dailyCapMicroUsd: number | null };

/** The user's controls straight from the database (no cache). Unknown user: nothing set. */
export async function getAiControls(userId: string): Promise<AiControls> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { aiBlocked: true, dailyCapMicroUsd: true } });
  return u ?? { aiBlocked: false, dailyCapMicroUsd: null };
}

/** The cap that applies: the user's own when set, else the default. */
export const effectiveDailyCapMicroUsd = (controls: Pick<AiControls, "dailyCapMicroUsd">, defaultCapMicroUsd: number): number =>
  controls.dailyCapMicroUsd ?? defaultCapMicroUsd;

export async function setAiControls(userId: string, change: { aiBlocked?: boolean; dailyCapMicroUsd?: number | null }): Promise<AiControls> {
  const cap = change.dailyCapMicroUsd;
  if (cap != null && (!Number.isInteger(cap) || cap < 0 || cap > 1_000_000_000)) throw new RangeError("Daily cap must be between $0 and $1,000.");
  const u = await prisma.user.update({
    where: { id: userId },
    data: { ...(change.aiBlocked !== undefined ? { aiBlocked: change.aiBlocked } : {}), ...(cap !== undefined ? { dailyCapMicroUsd: cap } : {}) },
    select: { aiBlocked: true, dailyCapMicroUsd: true },
  });
  gateCache.clear();
  return u;
}

/** The user that owns a profile (for entry points that only know the profile). */
export async function ownerOfProfile(profileId: string): Promise<{ userId: string; teamId: string } | null> {
  const p = await prisma.profile.findUnique({ where: { id: profileId }, select: { ownerUserId: true, teamId: true } });
  return p ? { userId: p.ownerUserId, teamId: p.teamId } : null;
}

/** True when an admin paused AI for this user. Uncached; for entry points that answer with the polite message. */
export async function isAiBlocked(userId: string): Promise<boolean> {
  return (await getAiControls(userId)).aiBlocked;
}

/** Throws AiBlockedError when AI is paused for the user. Call before any model call at an entry point. */
export async function assertAiNotBlocked(userId: string): Promise<void> {
  if (await isAiBlocked(userId)) throw new AiBlockedError();
}

// The gate used by `bindUsage` clients: a short cache keeps a burst of calls to one lookup.
const GATE_TTL_MS = 10_000;
const gateCache = new Map<string, { blocked: boolean; at: number }>();

async function gate(who: UsageWho): Promise<void> {
  const userId = who.userId ?? (who.profileId ? (await ownerOfProfile(who.profileId))?.userId : undefined);
  if (!userId) return;
  const hit = gateCache.get(userId);
  if (hit && Date.now() - hit.at < GATE_TTL_MS) {
    if (hit.blocked) throw new AiBlockedError();
    return;
  }
  const blocked = await isAiBlocked(userId);
  if (gateCache.size > 5_000) gateCache.clear();
  gateCache.set(userId, { blocked, at: Date.now() });
  if (blocked) throw new AiBlockedError();
}

/** Connects the ledger and the block gate to the AI package. Runs when this module loads; exported for tests. */
export function registerAiUsage(): void {
  setUsageRecorder(recordAiUsage);
  setUsageGate(gate);
}
registerAiUsage();

// ---- aggregates (raw SQL; UTC days) ------------------------------------------------------------------------------

const DAY_MS = 86_400_000;
export const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export type DayFeatureRow = { day: string; feature: string; costMicroUsd: number; calls: number };

/** Cost per UTC day per feature for the last `days` days including today, oldest first. Only days with spend appear. */
export async function spendByDay(days: number, now: Date = new Date()): Promise<DayFeatureRow[]> {
  const since = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
  const rows = await prisma.$queryRaw<{ day: string; feature: string; cost: bigint | null; calls: bigint }[]>(Prisma.sql`
    SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, feature, SUM("costMicroUsd") AS cost, COUNT(*) AS calls
    FROM "AiUsage"
    WHERE "createdAt" >= ${since}
    GROUP BY 1, 2
    ORDER BY 1, 2`);
  return rows.map((r) => ({ day: r.day, feature: r.feature, costMicroUsd: Number(r.cost ?? 0), calls: Number(r.calls) }));
}

export type PeriodTotals = { today: Record<string, number>; week: Record<string, number>; month: Record<string, number> };

/** Cost per feature for today (UTC), the last 7 days and the last 30 days (both including today). */
export async function spendTotals(now: Date = new Date()): Promise<PeriodTotals> {
  const midnight = startOfUtcDay(now);
  const week = new Date(midnight.getTime() - 6 * DAY_MS);
  const month = new Date(midnight.getTime() - 29 * DAY_MS);
  const rows = await prisma.$queryRaw<{ feature: string; today: bigint | null; week: bigint | null; month: bigint | null }[]>(Prisma.sql`
    SELECT feature,
      SUM("costMicroUsd") FILTER (WHERE "createdAt" >= ${midnight}) AS today,
      SUM("costMicroUsd") FILTER (WHERE "createdAt" >= ${week}) AS week,
      SUM("costMicroUsd") AS month
    FROM "AiUsage"
    WHERE "createdAt" >= ${month}
    GROUP BY feature`);
  const out: PeriodTotals = { today: {}, week: {}, month: {} };
  for (const r of rows) {
    out.today[r.feature] = Number(r.today ?? 0);
    out.week[r.feature] = Number(r.week ?? 0);
    out.month[r.feature] = Number(r.month ?? 0);
  }
  return out;
}

export const USER_SORTS = ["name", "today", "week", "month", "tokens"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export type UserSpendRow = {
  userId: string;
  name: string | null;
  email: string;
  aiBlocked: boolean;
  dailyCapMicroUsd: number | null;
  todayMicroUsd: number;
  weekMicroUsd: number;
  monthMicroUsd: number;
  todayTokens: number;
  weekTokens: number;
  monthTokens: number;
};

/** One page of users with their cost and tokens for today / 7 d / 30 d, aggregated in SQL. Users with no usage are included. */
export async function spendPerUser(opts: { search?: string; sort?: UserSort; dir?: "asc" | "desc"; page?: number; pageSize?: number; now?: Date } = {}): Promise<{ rows: UserSpendRow[]; total: number; page: number; pageSize: number }> {
  const now = opts.now ?? new Date();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const midnight = startOfUtcDay(now);
  const week = new Date(midnight.getTime() - 6 * DAY_MS);
  const month = new Date(midnight.getTime() - 29 * DAY_MS);
  const search = opts.search?.trim().slice(0, 100);
  const like = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;
  const where = like ? Prisma.sql`WHERE u.email ILIKE ${like} OR u.name ILIKE ${like}` : Prisma.empty;
  const sort = USER_SORTS.includes(opts.sort as UserSort) ? (opts.sort as UserSort) : "month";
  const orderCol = { name: Prisma.sql`lower(coalesce(u.name, u.email))`, today: Prisma.sql`today`, week: Prisma.sql`week`, month: Prisma.sql`month`, tokens: Prisma.sql`month_tokens` }[sort];
  const dir = opts.dir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const [counted] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM "User" u ${where}`);
  const rows = await prisma.$queryRaw<
    { id: string; name: string | null; email: string; aiBlocked: boolean; dailyCapMicroUsd: number | null; today: bigint; week: bigint; month: bigint; today_tokens: bigint; week_tokens: bigint; month_tokens: bigint }[]
  >(Prisma.sql`
    SELECT u.id, u.name, u.email, u."aiBlocked", u."dailyCapMicroUsd",
      COALESCE(a.today, 0) AS today, COALESCE(a.week, 0) AS week, COALESCE(a.month, 0) AS month,
      COALESCE(a.today_tokens, 0) AS today_tokens, COALESCE(a.week_tokens, 0) AS week_tokens, COALESCE(a.month_tokens, 0) AS month_tokens
    FROM "User" u
    LEFT JOIN (
      SELECT "userId",
        SUM("costMicroUsd") FILTER (WHERE "createdAt" >= ${midnight}) AS today,
        SUM("costMicroUsd") FILTER (WHERE "createdAt" >= ${week}) AS week,
        SUM("costMicroUsd") AS month,
        SUM("inputTokens" + "outputTokens") FILTER (WHERE "createdAt" >= ${midnight}) AS today_tokens,
        SUM("inputTokens" + "outputTokens") FILTER (WHERE "createdAt" >= ${week}) AS week_tokens,
        SUM("inputTokens" + "outputTokens") AS month_tokens
      FROM "AiUsage" WHERE "createdAt" >= ${month} AND "userId" IS NOT NULL GROUP BY "userId"
    ) a ON a."userId" = u.id
    ${where}
    ORDER BY ${orderCol} ${dir}, u.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  return {
    total: Number(counted?.n ?? 0),
    page,
    pageSize,
    rows: rows.map((r) => ({
      userId: r.id,
      name: r.name,
      email: r.email,
      aiBlocked: r.aiBlocked,
      dailyCapMicroUsd: r.dailyCapMicroUsd,
      todayMicroUsd: Number(r.today),
      weekMicroUsd: Number(r.week),
      monthMicroUsd: Number(r.month),
      todayTokens: Number(r.today_tokens),
      weekTokens: Number(r.week_tokens),
      monthTokens: Number(r.month_tokens),
    })),
  };
}

export type BreakdownRow = { feature: string; model: string; calls: number; inputTokens: number; outputTokens: number; costMicroUsd: number };

/** One user's last-30-day usage grouped by feature and model, biggest cost first. */
export async function userBreakdown(userId: string, now: Date = new Date()): Promise<BreakdownRow[]> {
  const since = new Date(startOfUtcDay(now).getTime() - 29 * DAY_MS);
  const rows = await prisma.$queryRaw<{ feature: string; model: string; calls: bigint; inp: bigint | null; outp: bigint | null; cost: bigint | null }[]>(Prisma.sql`
    SELECT feature, model, COUNT(*) AS calls, SUM("inputTokens") AS inp, SUM("outputTokens") AS outp, SUM("costMicroUsd") AS cost
    FROM "AiUsage" WHERE "userId" = ${userId} AND "createdAt" >= ${since}
    GROUP BY feature, model ORDER BY cost DESC NULLS LAST, feature`);
  return rows.map((r) => ({ feature: r.feature, model: r.model, calls: Number(r.calls), inputTokens: Number(r.inp ?? 0), outputTokens: Number(r.outp ?? 0), costMicroUsd: Number(r.cost ?? 0) }));
}

/** One user's ledger cost so far today (UTC), across all their profiles. */
export async function spentToday(userId: string, now: Date = new Date()): Promise<number> {
  const r = await prisma.aiUsage.aggregate({ where: { userId, createdAt: { gte: startOfUtcDay(now) } }, _sum: { costMicroUsd: true } });
  return r._sum.costMicroUsd ?? 0;
}
