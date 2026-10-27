import Link from "next/link";
import { chatDailyCapMicroUsd } from "@brandloop/ai";
import { spendByDay, spendPerUser, spendTotals, userBreakdown, USER_SORTS, type UserSort } from "@brandloop/db";
import { prisma } from "@brandloop/db";
import { cn } from "@brandloop/ui";
import { PageBody, PageHeader, SectionHeading } from "@/components/page";
import { LimitControls } from "@/components/admin/limit-controls";
import { SpendChart } from "@/components/admin/spend-chart";
import { requireAdmin } from "@/lib/admin";
import { buildChart, compactNumber, featureLabel, featureRows, sumTotals, usd } from "@/lib/admin-format";

type Search = { q?: string; sort?: string; dir?: string; page?: string; user?: string };

const PAGE_SIZE = 20;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(base: Search, over: Partial<Search>): string {
  const merged = { ...base, ...over };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin?${s}` : "/admin";
}

const th = "px-4 py-3 text-left text-[12px] font-medium text-text-3 whitespace-nowrap";
const td = "px-4 py-3 align-middle text-[14px] text-text-soft";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const raw = await searchParams;
  const sp: Search = { q: one(raw.q), sort: one(raw.sort), dir: one(raw.dir), page: one(raw.page), user: one(raw.user) };
  const sort: UserSort = USER_SORTS.includes(sp.sort as UserSort) ? (sp.sort as UserSort) : "month";
  const dir = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sort === "name" ? "asc" : "desc";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const now = new Date();

  const [days, totals, users] = await Promise.all([
    spendByDay(30, now),
    spendTotals(now),
    spendPerUser({ search: sp.q, sort, dir, page, pageSize: PAGE_SIZE, now }),
  ]);
  const detail = sp.user ? await prisma.user.findUnique({ where: { id: sp.user }, select: { id: true, name: true, email: true } }) : null;
  const breakdown = detail ? await userBreakdown(detail.id, now) : [];

  const chart = buildChart(days, 30, now);
  const defaultCap = chatDailyCapMicroUsd();
  const defaultCapUsd = (defaultCap / 1_000_000).toString();
  const pages = Math.max(1, Math.ceil(users.total / PAGE_SIZE));
  const stats = [
    { label: "Today (UTC)", micro: sumTotals(totals.today) },
    { label: "Last 7 days", micro: sumTotals(totals.week) },
    { label: "Last 30 days", micro: sumTotals(totals.month) },
  ];
  const sortLink = (col: UserSort, label: string) => {
    const active = sort === col;
    const next = active && dir === "desc" ? "asc" : active ? "desc" : col === "name" ? "asc" : "desc";
    return (
      <Link href={href(sp, { sort: col, dir: next, page: undefined })} className={cn("inline-flex items-center gap-1 hover:text-text", active && "text-text")}>
        {label}
        <span aria-hidden="true">{active ? (dir === "desc" ? "↓" : "↑") : ""}</span>
      </Link>
    );
  };
  const ariaSort = (col: UserSort) => (sort === col ? (dir === "desc" ? "descending" : "ascending") : "none");

  return (
    <>
      <PageHeader
        title="AI usage"
        subtitle="Costs are Orbit's estimates: token counts times the price table (AI_PRICE_* can override it), and a per-image estimate for images. They are not a provider invoice."
        actions={
          <Link href="/" className="orbit-transition inline-flex h-10 items-center rounded-pill border border-line-3 px-4 text-[14px] text-text hover:bg-line-soft">
            Back to Orbit
          </Link>
        }
      />
      <PageBody className="flex flex-col gap-10">
        <section aria-label="Totals" className="grid gap-4 sm:grid-cols-3" data-admin-totals>
          {stats.map((s) => (
            <div key={s.label} className="orbit-panel flex min-w-0 flex-col gap-3 p-5">
              <span className="text-[13px] text-text-2">{s.label}</span>
              <span className="type-stat !text-[40px] !leading-none text-text tabular-nums" data-total={s.label}>
                {usd(s.micro)}
              </span>
            </div>
          ))}
        </section>

        <section aria-labelledby="spend-h" className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="orbit-panel p-5">
            <SectionHeading id="spend-h" title="Spend over time" note="last 30 days, by feature" />
            <SpendChart data={chart} />
          </div>
          <div className="orbit-panel overflow-x-auto p-5">
            <SectionHeading title="By feature" />
            <table className="w-full min-w-[320px] border-collapse" data-admin-features>
              <caption className="sr-only">AI cost by feature for today, the last 7 days and the last 30 days</caption>
              <thead>
                <tr className="border-b border-line-row">
                  <th scope="col" className={th + " pl-0"}>Feature</th>
                  <th scope="col" className={th + " text-right"}>Today</th>
                  <th scope="col" className={th + " text-right"}>7 days</th>
                  <th scope="col" className={th + " pr-0 text-right"}>30 days</th>
                </tr>
              </thead>
              <tbody>
                {featureRows(totals).map((r) => (
                  <tr key={r.feature} className="border-b border-line-row last:border-0">
                    <th scope="row" className={td + " pl-0 text-left font-normal text-text"}>{featureLabel(r.feature)}</th>
                    <td className={td + " text-right tabular-nums"}>{usd(r.today)}</td>
                    <td className={td + " text-right tabular-nums"}>{usd(r.week)}</td>
                    <td className={td + " pr-0 text-right tabular-nums"}>{usd(r.month)}</td>
                  </tr>
                ))}
                {featureRows(totals).length === 0 && (
                  <tr>
                    <td colSpan={4} className={td + " pl-0 text-text-2"}>No AI calls recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="users-h">
          <SectionHeading id="users-h" title="Spend and limits per user" note={`default daily cap ${usd(defaultCap)}`} />
          <form method="get" action="/admin" role="search" className="mb-4 flex flex-wrap items-center gap-2">
            <label htmlFor="admin-q" className="sr-only">Search users by name or email</label>
            <input
              id="admin-q"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search name or email"
              className="h-10 w-full max-w-sm rounded-card-sm border border-line-control bg-ground px-3.5 text-sm text-text placeholder:text-text-3 focus-visible:border-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            />
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
            {sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
            <button type="submit" className="orbit-transition h-10 rounded-pill border border-line-3 px-4 text-[14px] text-text hover:bg-line-soft">Search</button>
            {sp.q && <Link href={href(sp, { q: undefined, page: undefined })} className="text-[13px] text-text-2 underline underline-offset-4">Clear</Link>}
          </form>

          <div className="orbit-panel overflow-x-auto p-0">
            <table className="w-full min-w-[980px] border-collapse" data-admin-users>
              <caption className="sr-only">Per-user AI cost and tokens, with limits</caption>
              <thead>
                <tr className="border-b border-line-row">
                  <th scope="col" aria-sort={ariaSort("name")} className={th}>{sortLink("name", "User")}</th>
                  <th scope="col" aria-sort={ariaSort("today")} className={th}>{sortLink("today", "Today")}</th>
                  <th scope="col" aria-sort={ariaSort("week")} className={th}>{sortLink("week", "7 days")}</th>
                  <th scope="col" aria-sort={ariaSort("month")} className={th}>{sortLink("month", "30 days")}</th>
                  <th scope="col" aria-sort={ariaSort("tokens")} className={th}>{sortLink("tokens", "Tokens (30 d)")}</th>
                  <th scope="col" className={th}>Daily cap and AI access</th>
                </tr>
              </thead>
              <tbody>
                {users.rows.map((u) => {
                  const label = u.name || u.email;
                  return (
                    <tr key={u.userId} data-user-row={u.email} className="border-b border-line-row last:border-0">
                      <th scope="row" className={td + " text-left font-normal"}>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-text">{u.name || u.email}</span>
                          {u.name && <span className="truncate text-xs text-text-3">{u.email}</span>}
                          <Link href={href(sp, { user: detail?.id === u.userId ? undefined : u.userId })} className="mt-1 w-fit text-xs text-accent-text underline underline-offset-4" aria-expanded={detail?.id === u.userId}>
                            {detail?.id === u.userId ? "Hide breakdown" : "Breakdown"}
                          </Link>
                        </div>
                      </th>
                      <td className={td + " tabular-nums"}>{usd(u.todayMicroUsd)}<span className="block text-xs text-text-3">{compactNumber(u.todayTokens)} tok</span></td>
                      <td className={td + " tabular-nums"}>{usd(u.weekMicroUsd)}<span className="block text-xs text-text-3">{compactNumber(u.weekTokens)} tok</span></td>
                      <td className={td + " tabular-nums"}>{usd(u.monthMicroUsd)}<span className="block text-xs text-text-3">{compactNumber(u.monthTokens)} tok</span></td>
                      <td className={td + " tabular-nums"}>{compactNumber(u.monthTokens)}</td>
                      <td className={td}>
                        <LimitControls
                          key={`${u.userId}:${u.dailyCapMicroUsd}:${u.aiBlocked}`}
                          userId={u.userId}
                          label={label}
                          capUsd={u.dailyCapMicroUsd == null ? "" : String(u.dailyCapMicroUsd / 1_000_000)}
                          defaultCapUsd={defaultCapUsd}
                          blocked={u.aiBlocked}
                        />
                      </td>
                    </tr>
                  );
                })}
                {users.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className={td + " text-text-2"}>No users match.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-[13px] text-text-2">
            <span>{users.total} {users.total === 1 ? "user" : "users"} · page {Math.min(page, pages)} of {pages}</span>
            <span className="flex gap-3">
              {page > 1 && <Link href={href(sp, { page: String(page - 1) })} className="underline underline-offset-4">Previous</Link>}
              {page < pages && <Link href={href(sp, { page: String(page + 1) })} className="underline underline-offset-4">Next</Link>}
            </span>
          </nav>

          {detail && (
            <div className="orbit-panel mt-6 overflow-x-auto p-5" data-admin-breakdown>
              <SectionHeading title={`${detail.name || detail.email}`} note="last 30 days by feature and model" />
              <table className="w-full min-w-[560px] border-collapse">
                <caption className="sr-only">Usage by feature and model</caption>
                <thead>
                  <tr className="border-b border-line-row">
                    <th scope="col" className={th + " pl-0"}>Feature</th>
                    <th scope="col" className={th}>Model</th>
                    <th scope="col" className={th + " text-right"}>Calls</th>
                    <th scope="col" className={th + " text-right"}>Input tok</th>
                    <th scope="col" className={th + " text-right"}>Output tok</th>
                    <th scope="col" className={th + " pr-0 text-right"}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((b) => (
                    <tr key={`${b.feature}:${b.model}`} className="border-b border-line-row last:border-0">
                      <th scope="row" className={td + " pl-0 text-left font-normal text-text"}>{featureLabel(b.feature)}</th>
                      <td className={td}>{b.model}</td>
                      <td className={td + " text-right tabular-nums"}>{b.calls}</td>
                      <td className={td + " text-right tabular-nums"}>{compactNumber(b.inputTokens)}</td>
                      <td className={td + " text-right tabular-nums"}>{compactNumber(b.outputTokens)}</td>
                      <td className={td + " pr-0 text-right tabular-nums"}>{usd(b.costMicroUsd)}</td>
                    </tr>
                  ))}
                  {breakdown.length === 0 && (
                    <tr>
                      <td colSpan={6} className={td + " pl-0 text-text-2"}>No AI calls from this user in the last 30 days.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </PageBody>
    </>
  );
}
