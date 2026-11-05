import { getChecklist, listNotifications, markNotificationsRead, prisma } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { weekStartOn } from "@/lib/ideas/week";
import { buildDerivedRows } from "@/lib/whats-new";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** GET /api/notifications: the derived rows, the newest stored events and how many are unread. */
export async function getNotificationsHandler(deps: { now?: () => Date } = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(400, "Create a profile first.");
  const week = weekStartOn(deps.now?.() ?? new Date(), profile.timezone ?? "UTC");
  const [stored, waiting, checklist] = await Promise.all([
    listNotifications(profile.id, 20),
    // Ideas for this week that are still untouched: not hidden, not drafted.
    prisma.idea.count({ where: { profileId: profile.id, origin: "weekly", weekStartOn: new Date(`${week}T00:00:00Z`), hidden: false, drafted: false } }),
    getChecklist(profile.id),
  ]);
  const next = checklist?.find((i) => !i.done && !i.comingSoon) ?? null;
  const derived = buildDerivedRows({
    challenge: null, // Filled in with the stored challenge (phase C).
    ideasWaiting: waiting,
    nextStep: next ? { title: next.label, href: next.href } : null,
  });
  return Response.json({
    derived,
    items: stored.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, href: i.href, createdAt: i.createdAt.toISOString(), read: Boolean(i.readAt) })),
    unread: stored.unread,
  });
}

const ReadBody = z.union([z.object({ ids: z.array(z.string().min(1).max(40)).max(50) }), z.object({ all: z.literal(true) })]);

/** POST /api/notifications/read `{ids}` or `{all: true}`. Ids that belong to another profile change nothing. */
export async function postNotificationsReadHandler(request: Request): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return fail(400, "Create a profile first.");
  const body = ReadBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Send { ids: [...] } or { all: true }.");
  await markNotificationsRead(profile.id, "all" in body.data ? "all" : body.data.ids);
  return Response.json({ ok: true });
}
