import { getProgressSignals } from "@brandloop/db";
import { addDays, countByDay, dayKeyIn, type DayKey } from "./days";
import type { DraftsByDay } from "./activity";

/** How far back draft history is read: enough for a finished sprint, streak records and a few weeks of strip. */
export const HISTORY_DAYS = 400;

export type ProgressData = {
  timeZone: string;
  today: DayKey;
  drafts: DraftsByDay;
  draftTotal: number;
  strategy: boolean;
  identity: boolean;
  knowledge: boolean;
  voice: boolean;
};

/** Everything Activities and the sprint derive from, read from existing tables only. */
export async function loadProgress(profile: { id: string; timezone: string }, now = new Date()): Promise<ProgressData> {
  const timeZone = profile.timezone || "UTC";
  const today = dayKeyIn(now, timeZone);
  // A day of slack on the window edge; the timezone decides which local day each draft lands on.
  const since = new Date(Date.parse(`${addDays(today, -HISTORY_DAYS - 1)}T00:00:00Z`));
  const signals = await getProgressSignals(profile.id, since);
  return {
    timeZone,
    today,
    drafts: countByDay(signals.draftDates, timeZone),
    draftTotal: signals.draftTotal,
    strategy: signals.hasStrategy,
    identity: signals.hasIdentity,
    knowledge: signals.knowledgeReady > 0,
    voice: signals.hasOwnVoice,
  };
}
