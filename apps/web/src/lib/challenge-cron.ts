import { createNotification, listEndingChallenges } from "@brandloop/db";

/** The daily run's challenge step: "Your challenge ends in 3 days", once per challenge (the dedupeKey is the enrollment). */
export async function challengeEndingHook({ now }: { now: Date }): Promise<void> {
  for (const c of await listEndingChallenges(now, 3)) {
    await createNotification(c.profileId, {
      kind: "CHALLENGE_ENDING",
      title: "Your challenge ends in 3 days",
      href: "/challenge",
      dedupeKey: `challenge-ending:${c.enrollmentId}`,
    });
  }
}
