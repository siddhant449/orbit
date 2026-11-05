import { awardBadges } from "@brandloop/db";

/** Awards whatever the profile has newly earned. A badge problem never fails the action that triggered it. */
export async function awardBadgesQuietly(profileId: string): Promise<string[]> {
  try {
    return await awardBadges(profileId);
  } catch (err) {
    console.error(`[badges] ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
