export type Greeting = "Good morning." | "Good afternoon." | "Good evening.";

function hourIn(date: Date, timeZone: string): number {
  const read = (tz: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(date));
  try {
    return read(timeZone);
  } catch {
    return read("UTC");
  }
}

/** Orbit's greeting (screens.md B1): up to 11:59 morning, up to 17:59 afternoon, else evening, in the profile's timezone. */
export function greetingFor(date: Date, timeZone: string): Greeting {
  const hour = hourIn(date, timeZone);
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}
