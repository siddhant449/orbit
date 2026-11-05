import { ChallengeError, endChallenge, getActiveChallenge, openChallengeDay, startChallenge, type ActiveChallenge } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";
import { awardBadgesQuietly } from "@/lib/progress/award";
import { dayKeyIn } from "@/lib/progress/days";
import { findSprintFormat, pickFormats } from "@/lib/sprint/curriculum";
import type { ChallengeView } from "@/lib/sprint/status";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const NEED_PROFILE = () => fail(400, "Create a profile first.");

/** The stored challenge as the client reads it (dates as strings). */
export function toChallengeView(c: ActiveChallenge): ChallengeView {
  return {
    id: c.id,
    startDate: c.startDate,
    finishDate: c.finishDate,
    today: c.today,
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
    days: c.days.map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date,
      formatId: d.formatId,
      chatId: d.chatId,
      doc: d.doc ? { id: d.doc.id, title: d.doc.title, postedAt: d.doc.postedAt ? d.doc.postedAt.toISOString() : null } : null,
    })),
  };
}

function fromError(err: unknown): Response {
  if (err instanceof ChallengeError) {
    return fail(err.code === "conflict" ? 409 : err.code === "not_found" ? 404 : 400, err.message);
  }
  throw err;
}

type Deps = { now?: () => Date };

/** GET /api/challenge: `{challenge}` (null when none). */
export async function getChallengeHandler(deps: Deps = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const challenge = await getActiveChallenge(profile.id, deps.now?.());
  // Reading a challenge past its 30th day is what completes it, so this is where the finished badge is earned.
  if (challenge?.completedAt) await awardBadgesQuietly(profile.id);
  return Response.json({ challenge: challenge ? toChallengeView(challenge) : null });
}

const Start = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** POST /api/challenge `{startDate?}` (default: today in the profile's zone). 201, or 409 when one is running. */
export async function postChallengeHandler(request: Request, deps: Deps = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const body = Start.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return fail(400, "Send { startDate: 'YYYY-MM-DD' } or nothing to start today.");
  const now = deps.now?.() ?? new Date();
  const startDate = body.data.startDate ?? dayKeyIn(now, profile.timezone || "UTC");
  try {
    const c = await startChallenge(profile.id, startDate, pickFormats().map((f) => f.id), now);
    return Response.json({ challenge: toChallengeView(c) }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}

/** DELETE /api/challenge: ends the running challenge (the posts stay). 404 when there is none. */
export async function deleteChallengeHandler(deps: Deps = {}): Promise<Response> {
  const profile = (await getAccount())?.currentProfile;
  if (!profile) return NEED_PROFILE();
  if (!(await endChallenge(profile.id, deps.now?.()))) return fail(404, "No challenge is running.");
  await awardBadgesQuietly(profile.id);
  return Response.json({ ok: true });
}

/** POST /api/challenge/days/:n/open: the day's chat (created once). The chat page seeds it with the day's prompt. */
export async function openDayHandler(n: string, deps: Deps = {}): Promise<Response> {
  const account = await getAccount();
  const profile = account?.currentProfile;
  if (!profile) return NEED_PROFILE();
  const dayNumber = Number(n);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 30) return fail(404, "That day isn't in your challenge.");
  try {
    const current = await getActiveChallenge(profile.id, deps.now?.());
    const format = findSprintFormat(current?.days.find((d) => d.dayNumber === dayNumber)?.formatId);
    const out = await openChallengeDay(profile.id, account.user.id, dayNumber, {
      title: format ? `Day ${dayNumber} · ${format.title}` : undefined,
      now: deps.now?.(),
    });
    return Response.json(out);
  } catch (err) {
    return fromError(err);
  }
}
