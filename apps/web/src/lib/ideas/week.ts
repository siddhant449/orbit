import { weekOf } from "../ideas";

/** The Monday (YYYY-MM-DD) of the profile's local week at `now`. An unknown zone falls back to UTC. */
export function weekStartOn(now: Date, timezone: string): string {
  return weekOf(now, timezone);
}

/** The profile's local weekday at `now`, 1 = Monday to 7 = Sunday. */
export function localWeekday(now: Date, timezone: string): number {
  const days: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const name = (zone: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone }).format(now);
  try {
    return days[name(timezone)] ?? 1;
  } catch {
    return days[name("UTC")] ?? 1;
  }
}

/** True on and after the profile's generation day (1 = Mon … 7 = Sun) in their own week, so a missed day catches up. */
export function dueForGeneration(now: Date, timezone: string, generationDayOfWeek: number): boolean {
  const day = Math.min(7, Math.max(1, Math.trunc(generationDayOfWeek) || 1));
  return localWeekday(now, timezone) >= day;
}
